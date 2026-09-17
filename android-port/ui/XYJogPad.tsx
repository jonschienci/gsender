import {useEffect, useRef, useState} from 'react';
import {padVector} from './pad-vector.cjs';

type Props = {disabled:boolean; rapidFeed:number; units:string};
type Contact = {id:number; token?:string; ticket?:string; x:number; y:number; busy:boolean; ended:boolean};
const origin={x:0,y:0,speed:0};

export default function XYJogPad({disabled,rapidFeed,units}:Props) {
    const surface=useRef<HTMLDivElement>(null),contact=useRef<Contact|null>(null);
    const [point,setPoint]=useState(origin),[ready,setReady]=useState(false),[message,setMessage]=useState('Checking CNC…');
    const lastError=useRef<string|null>(null);
    const showError=(error:unknown)=>{lastError.current=(error as Error).message;setMessage(lastError.current);};
    const finishRef=useRef<()=>void>(()=>{});
    const sendRef=useRef<()=>void>(()=>{});
    const post=async(action:string,body:object,keepalive=false)=>{
        const response=await fetch('/api/tablet-pad/'+action,{method:'POST',keepalive,
            headers:{'Content-Type':'application/json','X-USB-Pendant':'1'},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'XY pad unavailable');return data;
    };
    const finish=()=>{
        const c=contact.current;if(!c)return;
        contact.current=null;c.ended=true;setPoint(origin);setMessage('Stopped');
        if(surface.current?.hasPointerCapture(c.id))surface.current.releasePointerCapture(c.id);
        if(c.token)void post('end',{token:c.token},true).catch(()=>{});
    };
    finishRef.current=finish;
    useEffect(()=>{
        finishRef.current();
    },[disabled,rapidFeed,units]);
    useEffect(()=>{
        let alive=true,polling=false;
        const poll=async()=>{
            if(polling||contact.current||document.visibilityState!=='visible')return;
            polling=true;
            try {
                const r=await fetch('/api/tablet-pad');const s=await r.json();
                if(alive && !contact.current){setReady(r.ok&&s.ready);if(!lastError.current)setMessage(s.ready?'Touch center, then drag':s.reason||s.error||'Waiting for idle CNC');}
            }catch{if(alive && !contact.current){setReady(false);if(!lastError.current)setMessage('CNC unavailable');}}finally{polling=false;}
        };
        const stop=()=>finishRef.current();
        const visibility=()=>{if(document.visibilityState!=='visible'||(window as any).__usbKnobActive===false)stop();};
        const pointerEnd=(e:PointerEvent)=>{if(e.pointerId===contact.current?.id)stop();};
        const secondPointer=(e:PointerEvent)=>{if(contact.current&&e.pointerId!==contact.current.id)stop();};
        window.addEventListener('pointerup',pointerEnd,true);window.addEventListener('pointercancel',pointerEnd,true);
        window.addEventListener('pointerdown',secondPointer,true);
        document.addEventListener('keydown',stop);document.addEventListener('focusin',stop);
        window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);window.addEventListener('resize',stop);
        document.addEventListener('visibilitychange',visibility);window.addEventListener('usb-knob-visibility',visibility);
        void poll();const timer=setInterval(poll,500);
        return ()=>{
            alive=false;clearInterval(timer);stop();
            window.removeEventListener('pointerup',pointerEnd,true);window.removeEventListener('pointercancel',pointerEnd,true);
            window.removeEventListener('pointerdown',secondPointer,true);
            document.removeEventListener('keydown',stop);document.removeEventListener('focusin',stop);
            window.removeEventListener('blur',stop);window.removeEventListener('pagehide',stop);window.removeEventListener('resize',stop);
            document.removeEventListener('visibilitychange',visibility);window.removeEventListener('usb-knob-visibility',visibility);
        };
    },[]);
    useEffect(()=>{
        const send=async()=>{
            const c=contact.current;
            if(!c||c.busy||!c.token||!c.ticket)return;
            if(document.visibilityState!=='visible'||(window as any).__usbKnobActive===false||!surface.current?.hasPointerCapture(c.id)) {finishRef.current();return;}
            c.busy=true;
            let resync=false;
            try {
                const next=await post('move',{token:c.token,ticket:c.ticket,x:c.x,y:c.y});
                if(!c.ended){
                    c.ticket=next.ticket;resync=next.resync===true;
                    setMessage(resync||next.recovering?'Restoring touch connection…':'XY pad active');
                }
            }catch(error){if(!c.ended){finishRef.current();showError(error);}}
            finally{
                c.busy=false;
                // A recovered challenge needs a NEW sample of this still-held
                // contact. Do not wait an extra interval or resend the old body.
                if(resync&&!c.ended)queueMicrotask(()=>sendRef.current());
            }
        };
        sendRef.current=()=>{void send();};
        const timer=setInterval(sendRef.current,40);
        return ()=>{clearInterval(timer);sendRef.current=()=>{};};
    },[]);
    const coordinates=(e:{clientX:number;clientY:number})=>{
        const rect=surface.current!.getBoundingClientRect();
        return {x:Math.max(-1,Math.min(1,(e.clientX-rect.left-rect.width/2)/(rect.width/2))),
            y:Math.max(-1,Math.min(1,(rect.top+rect.height/2-e.clientY)/(rect.height/2))),
            outside:e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom};
    };
    const shownFeed=point.speed*rapidFeed/(units==='in'?25.4:1);
    return <div className="text-gray-700 dark:text-content-primary">
        <div ref={surface} role="group" aria-label="XY variable-speed jog pad" aria-disabled={disabled||!ready}
            style={{position:'relative',height:'clamp(170px,26vh,280px)',border:'2px solid #64748b',borderRadius:14,overflow:'hidden',
                touchAction:'none',userSelect:'none',opacity:disabled||!ready?0.5:1,background:'radial-gradient(ellipse at center,rgba(56,189,248,.12),transparent 75%)'}}
            onContextMenu={e=>e.preventDefault()}
            onLostPointerCapture={finish}
            onPointerDown={async e=>{
                e.preventDefault();if(disabled||!ready||contact.current||!e.isPrimary||e.button!==0)return;
                const p=coordinates(e);if(Math.hypot(p.x,p.y)>.18){setMessage('Start at the center');return;}
                lastError.current=null;
                const c:Contact={id:e.pointerId,x:0,y:0,busy:true,ended:false};contact.current=c;
                e.currentTarget.setPointerCapture(e.pointerId);setMessage('XY pad active');
                try {
                    const lease=await post('begin',{visible:document.visibilityState==='visible',rapid:rapidFeed});
                    c.token=lease.token;c.ticket=lease.ticket;
                    if(c.ended)void post('end',{token:c.token},true).catch(()=>{});
                }catch(error){if(!c.ended){finish();showError(error);}}
                finally{c.busy=false;if(!c.ended)sendRef.current();}
            }}
            onPointerMove={e=>{
                const c=contact.current;if(!c||c.id!==e.pointerId)return;
                if(!e.buttons){finish();return;}
                const p=coordinates(e);if(p.outside){finish();return;}
                c.x=p.x;c.y=p.y;setPoint({...p,speed:padVector(p.x,p.y).speed});
            }}>
            <svg viewBox="0 0 200 200" preserveAspectRatio="none" aria-hidden="true" style={{position:'absolute',width:'100%',height:'100%',pointerEvents:'none'}}>
                {[25,50,75,125,150,175].map(n=><g key={n} stroke="currentColor" opacity=".10"><path d={`M${n} 0V200 M0 ${n}H200`}/></g>)}
                <circle cx="100" cy="100" r="88" stroke="currentColor" opacity=".3" fill="none"/>
                <path d="M100 0V200 M0 100H200" stroke="currentColor" opacity=".4"/>
                <circle cx="100" cy="100" r="6" fill="currentColor" opacity=".18"/>
                <path d={`M100 100L${100+point.x*88} ${100-point.y*88}`} stroke="#38bdf8" strokeWidth="1.5"/>
            </svg>
            <span style={{position:'absolute',left:'50%',top:7,transform:'translateX(-50%)',fontWeight:700}}>Y+</span>
            <span style={{position:'absolute',left:'50%',bottom:7,transform:'translateX(-50%)',fontWeight:700}}>Y−</span>
            <span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontWeight:700}}>X−</span>
            <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontWeight:700}}>X+</span>
            <span style={{position:'absolute',left:`${50+point.x*44}%`,top:`${50-point.y*44}%`,transform:'translate(-50%,-50%)',width:22,height:22,borderRadius:'50%',background:'#0ea5e9',border:'2px solid #bae6fd',boxShadow:'0 2px 8px #0005',pointerEvents:'none'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',gap:8,fontSize:12,marginTop:6}}>
            <span role="status">{message}</span><span>{shownFeed.toFixed(units==='in'?1:0)} / {(rapidFeed/(units==='in'?25.4:1)).toFixed(units==='in'?1:0)} {units==='in'?'in':'mm'}/min</span>
        </div>
    </div>;
}
