import {useEffect, useRef, useState} from 'react';
import {padVector, padStepDirection} from './pad-vector.cjs';

type Props = {disabled:boolean; rapidFeed:number; units:string; onStep?:(x:number,y:number)=>void; onReadinessChange?:(ready:boolean)=>void; displayPoint?:{x:number;y:number}};
type Contact = {id:number; token?:string; ticket?:string; x:number; y:number; busy:boolean; ended:boolean};
type EdgeTouch = {id:number; x:number; y:number; startX:number; startY:number};
const directions=[{x:1,y:0,label:'X+',name:'X plus'},{x:1,y:1,label:'↗',name:'X plus Y plus'},{x:0,y:1,label:'Y+',name:'Y plus'},{x:-1,y:1,label:'↖',name:'X minus Y plus'},{x:-1,y:0,label:'X−',name:'X minus'},{x:-1,y:-1,label:'↙',name:'X minus Y minus'},{x:0,y:-1,label:'Y−',name:'Y minus'},{x:1,y:-1,label:'↘',name:'X plus Y minus'}];
const origin={x:0,y:0,speed:0};

export default function XYJogPad({disabled,rapidFeed,units,onStep,onReadinessChange,displayPoint}:Props) {
    const displayOnly=displayPoint!==undefined;
    const surface=useRef<HTMLDivElement>(null),contact=useRef<Contact|null>(null);
    const edgeTouch=useRef<EdgeTouch|null>(null),releaseRef=useRef<(event:PointerEvent)=>void>(()=>{});
    const [edge,setEdge]=useState<{x:number;y:number}|null>(null);
    const [point,setPoint]=useState(origin),[ready,setReady]=useState(false),[message,setMessage]=useState('Checking CNC…');
    useEffect(()=>{onReadinessChange?.(!disabled && ready);},[disabled,ready,onReadinessChange]);
    const lastError=useRef<string|null>(null);
    const showError=(error:unknown)=>{lastError.current=(error as Error).message;setReady(false);setMessage(lastError.current);};
    const finishRef=useRef<()=>void>(()=>{});
    const sendRef=useRef<()=>void>(()=>{});
    const post=async(action:string,body:object,keepalive=false)=>{
        const response=await fetch('/api/tablet-pad/'+action,{method:'POST',keepalive,
            headers:{'Content-Type':'application/json','X-USB-Pendant':'1'},body:JSON.stringify(body)});
        const data=await response.json();if(!response.ok)throw Error(data.error||'XY pad unavailable');return data;
    };
    const finish=()=>{
        const tap=edgeTouch.current;edgeTouch.current=null;setEdge(null);if(tap)setMessage('Stopped');
        if(tap&&surface.current?.hasPointerCapture(tap.id))surface.current.releasePointerCapture(tap.id);
        const c=contact.current;if(!c)return;
        contact.current=null;c.ended=true;setPoint(origin);setMessage('Stopped');
        if(surface.current?.hasPointerCapture(c.id))surface.current.releasePointerCapture(c.id);
        if(c.token)void post('end',{token:c.token},true).catch(()=>{});
    };
    finishRef.current=finish;
    useEffect(()=>{
        finishRef.current();
    },[disabled,rapidFeed,units,displayOnly]);
    useEffect(()=>{
        if(displayOnly)return;
        let alive=true,polling=false;
        const poll=async()=>{
            if(polling||contact.current||edgeTouch.current||document.visibilityState!=='visible')return;
            polling=true;
            try {
                const r=await fetch('/api/tablet-pad');const s=await r.json();
                if(alive && !contact.current && !edgeTouch.current){setReady(r.ok&&s.ready);if(!lastError.current)setMessage(s.ready?'Drag center · Tap rim for Precise steps':s.reason||s.error||'Waiting for idle CNC');}
            }catch{if(alive && !contact.current && !edgeTouch.current){setReady(false);if(!lastError.current)setMessage('CNC unavailable');}}finally{polling=false;}
        };
        const stop=()=>finishRef.current();
        const visibility=()=>{if(document.visibilityState!=='visible'||(window as any).__usbKnobActive===false)stop();};
        const pointerEnd=(e:PointerEvent)=>releaseRef.current(e);
        const pointerCancel=(e:PointerEvent)=>{if(e.pointerId===contact.current?.id||e.pointerId===edgeTouch.current?.id)stop();};
        const secondPointer=(e:PointerEvent)=>{const id=contact.current?.id??edgeTouch.current?.id;if(id!==undefined&&e.pointerId!==id)stop();};
        window.addEventListener('pointerup',pointerEnd,true);window.addEventListener('pointercancel',pointerCancel,true);
        window.addEventListener('pointerdown',secondPointer,true);
        document.addEventListener('keydown',stop);document.addEventListener('focusin',stop);
        window.addEventListener('blur',stop);window.addEventListener('pagehide',stop);window.addEventListener('resize',stop);
        document.addEventListener('visibilitychange',visibility);window.addEventListener('usb-knob-visibility',visibility);
        void poll();const timer=setInterval(poll,500);
        return ()=>{
            alive=false;clearInterval(timer);stop();
            window.removeEventListener('pointerup',pointerEnd,true);window.removeEventListener('pointercancel',pointerCancel,true);
            window.removeEventListener('pointerdown',secondPointer,true);
            document.removeEventListener('keydown',stop);document.removeEventListener('focusin',stop);
            window.removeEventListener('blur',stop);window.removeEventListener('pagehide',stop);window.removeEventListener('resize',stop);
            document.removeEventListener('visibilitychange',visibility);window.removeEventListener('usb-knob-visibility',visibility);
        };
    },[displayOnly]);
    useEffect(()=>{
        if(displayOnly)return;
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
    },[displayOnly]);
    const coordinates=(e:{clientX:number;clientY:number})=>{
        const rect=surface.current!.getBoundingClientRect();
        const x=(e.clientX-rect.left-rect.width/2)/(rect.width/2),y=(rect.top+rect.height/2-e.clientY)/(rect.height/2);
        return {x:Math.max(-1,Math.min(1,x)),y:Math.max(-1,Math.min(1,y)),outside:Math.hypot(x,y)>1};
    };
    const step=(x:number,y:number)=>{
        if(displayOnly||disabled||!ready||!onStep||document.visibilityState!=='visible'||(window as any).__usbKnobActive===false)return;
        try {onStep(x,y);lastError.current=null;setMessage('Precise step');try{(window as any).AndroidHaptics?.jogPress();}catch{}}
        catch(error){showError(error);}
    };
    releaseRef.current=e=>{
        const tap=edgeTouch.current;
        if(tap?.id===e.pointerId){
            const p=coordinates(e),direction=padStepDirection(p.x,p.y);
            const valid=!p.outside&&direction?.x===tap.x&&direction?.y===tap.y&&Math.hypot(e.clientX-tap.startX,e.clientY-tap.startY)<=16;
            finish();if(valid)step(tap.x,tap.y);return;
        }
        if(contact.current?.id===e.pointerId)finish();
    };
    const shownPoint=displayPoint??point;
    return <div className="android-xy-pad text-gray-700 dark:text-content-primary" style={{width:'100%'}}>
        <div ref={surface} role="group" aria-label={displayOnly?"XY tilt direction":"XY variable-speed jog pad"} aria-disabled={displayOnly||disabled||!ready}
            style={{position:'relative',width:'min(100%,600px)',margin:'0 auto',border:'2px solid #64748b',borderRadius:'50%',overflow:'hidden',
                touchAction:'none',userSelect:'none',opacity:displayOnly?1:disabled||!ready?0.5:1,background:'radial-gradient(circle at center,rgba(56,189,248,.12),transparent 75%)'}}
            onContextMenu={e=>e.preventDefault()}
            onLostPointerCapture={finish}
            onPointerDown={async e=>{
                e.preventDefault();if(displayOnly||disabled||!ready||contact.current||edgeTouch.current||!e.isPrimary||e.button!==0)return;
                const p=coordinates(e);if(p.outside)return;
                const direction=padStepDirection(p.x,p.y);
                if(direction&&onStep){
                    edgeTouch.current={id:e.pointerId,...direction,startX:e.clientX,startY:e.clientY};setEdge(direction);
                    e.currentTarget.setPointerCapture(e.pointerId);setMessage('Release for one Precise step');return;
                }
                if(Math.hypot(p.x,p.y)>.18){setMessage('Drag from center or tap the outer rim');return;}
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
                const tap=edgeTouch.current;
                if(tap?.id===e.pointerId){
                    const p=coordinates(e),direction=padStepDirection(p.x,p.y);
                    if(!e.buttons||p.outside||direction?.x!==tap.x||direction?.y!==tap.y||Math.hypot(e.clientX-tap.startX,e.clientY-tap.startY)>16)finish();
                    return;
                }
                const c=contact.current;if(!c||c.id!==e.pointerId)return;
                if(!e.buttons){finish();return;}
                const p=coordinates(e);if(p.outside){finish();return;}
                c.x=p.x;c.y=p.y;setPoint({...p,speed:padVector(p.x,p.y).speed});
            }}>
            <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{display:'block',width:'100%',height:'auto',pointerEvents:'none'}}>
                <circle cx="100" cy="100" r="85" stroke="currentColor" strokeWidth="29" opacity=".07" fill="none"/>
                <circle cx="100" cy="100" r="71" stroke="currentColor" opacity=".3" fill="none"/>
                {[0,1,2,3,4,5,6,7].map(n=>{const a=(n+.5)*Math.PI/4;return <path key={n} d={`M${100+72*Math.cos(a)} ${100-72*Math.sin(a)}L${100+100*Math.cos(a)} ${100-100*Math.sin(a)}`} stroke="currentColor" opacity=".2"/>;})}
                <path d="M100 36V164 M36 100H164" stroke="currentColor" opacity=".2"/>
                <circle cx="100" cy="100" r="18" stroke="#38bdf8" strokeDasharray="3 3" opacity=".6" fill="none"/>
                <path className="android-xy-direction" d={`M100 100L${100+shownPoint.x*88} ${100-shownPoint.y*88}`} stroke="#38bdf8" strokeWidth="1.5"/>
            </svg>
            {directions.map(d=>{const radius=Math.hypot(d.x,d.y);return <button key={d.name} type="button" aria-label={`Precise jog ${d.name}`} disabled={displayOnly||disabled||!ready||!onStep}
                tabIndex={onStep?0:-1} onKeyDown={e=>{
                    if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();
                    if(e.repeat||contact.current||edgeTouch.current){finish();return;}step(d.x,d.y);
                }}
                style={{position:'absolute',left:`${50+d.x/radius*42.5}%`,top:`${50-d.y/radius*42.5}%`,transform:'translate(-50%,-50%)',width:'18%',height:'18%',padding:0,border:0,borderRadius:'50%',fontSize:20,fontWeight:700,color:'inherit',background:edge?.x===d.x&&edge?.y===d.y?'#38bdf855':'transparent',touchAction:'none'}}>{d.label}</button>;})}
            <span className="android-xy-point" style={{position:'absolute',left:`${50+shownPoint.x*44}%`,top:`${50-shownPoint.y*44}%`,transform:'translate(-50%,-50%)',width:36,height:36,borderRadius:'50%',background:'#0ea5e9',border:'2px solid #bae6fd',boxShadow:'0 2px 8px #0005',pointerEvents:'none'}}/>
        </div>
        <span role="status" className="sr-only">{displayOnly?"Tilt direction indicator":message}</span>
    </div>;
}
