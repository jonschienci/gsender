import {createPortal} from 'react-dom';
import {Home, Crosshair, Scan, Maximize} from 'lucide-react';
import {homeMachine,zeroAllAxes} from 'app/features/DRO/utils/DRO';
import HoldAxisButton from '../../src/pendant/src/components/HoldAxisButton';
import {memo, useLayoutEffect, useRef, useState} from 'react';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
import {useWorkspaceState} from 'app/hooks/useWorkspaceState';
import {zHeightModel, zTicks, formatHeight} from './z-height-scale.mjs';
import './z-height-scale.css';
import useRotaryEnabled from '../../src/pendant/src/components/useRotaryEnabled';

export function ZHeightRuler({model, units='mm', height=320, homed=false}:any) {
    if(!model)return null;
    const top=48,bottom=Math.max(top+30,height-31),y=(z:number)=>top+model.position(z)*(bottom-top);
    const {machine,job,current}=model,track=108;
    const jobLabelY=job?Math.max(13,y(job.max)-24):13;
    const ticks=zTicks(model.min,model.max,units,Math.max(2,Math.floor((bottom-top)/50)));
    const tickStep=(ticks.length>1 ? ticks[1]-ticks[0] : model.max-model.min)/(units==='in'?25.4:1);
    const tickDigits=Math.min(6,Math.max(0,-Math.floor(Math.log10(tickStep))));
    const machineTitle=machine ? `Configured Z travel: ${formatHeight(machine.min,units)} to ${formatHeight(machine.max,units)} ${units} (${model.frame.toLowerCase()} coordinates)${homed?'':'; not homed'}` : 'Z travel unavailable';
    const description=[machineTitle,job?`Job Z range: ${formatHeight(job.min,units)} to ${formatHeight(job.max,units)} ${units}; includes rapid moves`:'No job',current!==null?`Current Z: ${formatHeight(current,units)} ${units}`:'Position unavailable'].join('. ');
    const currentValue=current===null?'—':formatHeight(current,units,units==='in'?3:2);
    const readoutY=current===null?height-15:y(current),readoutRight=track-34;
    const readoutWidth=Math.max(70,currentValue.length*9+16);
    return <svg width="108" height="100%" viewBox={`0 0 108 ${height}`} role="img" aria-label={description}>
        <title>{description}</title><defs><linearGradient id="z-job-edge-fade" x1="0%" x2="100%"><stop offset="0%" stopColor="#3f85c7" stopOpacity="0"/><stop offset="65%" stopColor="#3f85c7" stopOpacity="0.12"/><stop offset="100%" stopColor="#3f85c7" stopOpacity="0.7"/></linearGradient></defs>
        {job&&<g data-z-job="true"><rect x="68" y={y(job.max)} width="40" height={Math.max(2,y(job.min)-y(job.max))} fill="url(#z-job-edge-fade)"/>{[job.min,job.max].map((z,i)=><line key={i} x1="94" x2="108" y1={y(z)} y2={y(z)} stroke="#3f85c7" strokeWidth="2.5"/>)}</g>}
        {job&&<g fill="var(--z-job)" textAnchor="end">
            <text x="102" y={jobLabelY} fontSize="12" fontWeight="600">Job Height</text>
            <text x="102" y={jobLabelY+16} fontSize="12">{formatHeight(job.height,units)} {units}</text>
        </g>}

        {ticks.map(z=><g key={z}>
            <line x1={track-22} x2={track} y1={y(z)} y2={y(z)} stroke="currentColor" strokeWidth="1" opacity=".55"/>
            <text x={Math.abs(z)<1e-8?track-40:track-28} y={y(z)} textAnchor="end" dominantBaseline="central" fontSize="12" opacity=".85">{formatHeight(z,units,tickDigits)}</text>
        </g>)}
        {model.min<=0&&model.max>=0&&<rect data-z-origin="true" x={track-35} y={y(0)-4} width="34" height="8" rx="4" fill="#6b7280" stroke="#94a3b8" strokeWidth="1"/>}
        {machine&&<g stroke="currentColor" strokeWidth="2" data-z-travel="true">
            <line x1={track} x2={track} y1={y(machine.max)} y2={y(machine.min)} opacity=".55"/>
            {[machine.min,machine.max].map((z,i)=><line key={i} x1={track-22} x2={track} y1={y(z)} y2={y(z)} stroke="#f97316" strokeWidth="4"/>)}
            <title>{machineTitle}</title>
        </g>}
        {current!==null&&<g data-z-current="true" style={{color:model.outside?'var(--z-outside)':'var(--z-current)'}}>
            <path d={`M ${track-22} ${y(current)} l -10 -6 v 12 z`} fill="var(--z-current)"/>
            <line x1={track-22} x2={track} y1={y(current)} y2={y(current)} stroke="var(--z-current)" strokeWidth="1.5"/>

        </g>}
        <rect className="z-current-readout-box" role="button" tabIndex={0} aria-label="Edit visualizer Z coordinate" style={{pointerEvents:'all',cursor:'pointer'}}
            onPointerDown={event=>event.stopPropagation()}
            onClick={event=>{event.stopPropagation();window.dispatchEvent(new CustomEvent('android-edit-readout',{detail:{axis:'Z',rect:event.currentTarget.getBoundingClientRect().toJSON()}}));}}
            onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();window.dispatchEvent(new CustomEvent('android-edit-readout',{detail:{axis:'Z',rect:event.currentTarget.getBoundingClientRect().toJSON()}}));}}}
            x={readoutRight-readoutWidth} y={readoutY-22} width={readoutWidth} height="44" rx="5"/>
        <text x={readoutRight-readoutWidth/2} y={readoutY-10} textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="400" fontFamily="Roboto Mono, monospace" fill={current===null?'currentColor':'var(--z-current)'}>Z:</text>
        <text x={readoutRight-readoutWidth/2} y={readoutY+10} textAnchor="middle" dominantBaseline="central" fontSize="18" fontWeight="400" fontFamily="Roboto Mono, monospace" fill={current===null?'currentColor':'var(--z-current)'}>{currentValue}</text>
    </svg>;
}
function ViewportActions(){
 const connected=useTypedSelector(s=>s.connection.isConnected);
 const workflow=useTypedSelector(s=>s.controller.workflow.state);
 const active=useTypedSelector(s=>s.controller.state.status?.activeState);
 const alarmCode=useTypedSelector(s=>s.controller.state.status?.alarmCode);
 const homingEnabled=useTypedSelector(s=>Number(s.controller.settings?.settings?.$22)>0);
 const needsHome=connected&&workflow==='idle'&&active==='Alarm'&&(Number(alarmCode)===11||alarmCode==='Homing');
 const loading=useTypedSelector(s=>s.file.fileProcessing);
 const loaded=useTypedSelector(s=>s.file.fileLoaded);
 const wpos=useTypedSelector(s=>s.controller.wpos),mpos=useTypedSelector(s=>s.controller.mpos);
 const allowed=connected&&!loading&&workflow==='idle'&&active==='Idle';
 const [tracking,setTracking]=useState(false);
 const [holding,setHolding]=useState(false);
 const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const held=useRef(false);
 const cancelHold=()=>{if(holdTimer.current)clearTimeout(holdTimer.current);holdTimer.current=null;setHolding(false);};
 useLayoutEffect(()=>{const cancel=()=>{held.current=true;cancelHold();setTracking(false);};window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',cancel);return()=>{if(holdTimer.current)clearTimeout(holdTimer.current);window.removeEventListener('blur',cancel);document.removeEventListener('visibilitychange',cancel);};},[]);
 const center=(mode='position')=>{
  const svg=Array.from(document.querySelectorAll('.android-visualizer-canvas svg')).find(s=>(s as any).__gsenderViewport) as any;
  const viewport=svg?.__gsenderViewport;if(!viewport)return;
  const box=svg.getBoundingClientRect(),canvas=svg.closest('.android-visualizer-canvas');
  let left=16,right=16,top=40,bottom=16;
  const reserve=(selector:string,edge:string)=>canvas?.querySelectorAll(selector).forEach((el:Element)=>{
   const style=getComputedStyle(el),r=el.getBoundingClientRect();
   if(style.display==='none'||style.visibility==='hidden'||!r.width||!r.height)return;
   if(edge==='left')left=Math.max(left,r.right-box.left+16);
   if(edge==='right')right=Math.max(right,box.right-r.left+16);
   if(edge==='bottom')bottom=Math.max(bottom,box.bottom-r.top+16);
  });
  reserve('.android-timeline-popout,.android-timeline-popout,.android-view-actions','left');
  reserve('.android-z-height-scale,.z-current-readout-box','right');
  reserve('.android-rotary-dial,.android-job-progress,.android-job-controls,.android-file-actions','bottom');
  const usableWidth=Math.max(40,box.width-left-right),usableHeight=Math.max(40,box.height-top-bottom);
  const cx=left+usableWidth/2,cy=top+usableHeight/2;
  if(mode!=='position'){
   const rect=svg.querySelector('[data-machine-boundary]');
   const b=mode==='job'?viewport.bounds?.():rect?{minX:Number(rect.getAttribute('x')),maxX:Number(rect.getAttribute('x'))+Number(rect.getAttribute('width')),minY:-Number(rect.getAttribute('y'))-Number(rect.getAttribute('height')),maxY:-Number(rect.getAttribute('y'))}:null;
   if(!b||b.empty||![b.minX,b.maxX,b.minY,b.maxY].every(Number.isFinite))return;
   const scale=Math.min(Math.max(20,usableWidth-64)/Math.max(1,b.maxX-b.minX),Math.max(20,usableHeight-64)/Math.max(1,b.maxY-b.minY));
   const w=box.width/scale,h=box.height/scale;
   viewport.write({x:(b.minX+b.maxX)/2-cx/scale,y:-(b.minY+b.maxY)/2-cy/scale,w,h});return;
  }
  const p=loaded?wpos:mpos,x=Number(p?.x),y=Number(p?.y);if(!Number.isFinite(x)||!Number.isFinite(y))return;
  const v=viewport.read(),scale=Math.min(box.width/v.w,box.height/v.h);
  viewport.write({...v,x:x-v.w/2-(cx-box.width/2)/scale,y:-y-v.h/2-(cy-box.height/2)/scale});
 };
 const follow=useRef(center);follow.current=center;
 useLayoutEffect(()=>{
  if(!tracking)return;
  if(!connected||loading){setTracking(false);return;}
  const frame=requestAnimationFrame(()=>follow.current());
  return()=>cancelAnimationFrame(frame);
 },[tracking,connected,loading,loaded,wpos.x,wpos.y,mpos.x,mpos.y]);
 if(!connected||loading)return null;
 return <>{(allowed||needsHome)&&<div className="android-viewport-setup android-compact-setup"><div className={needsHome?"android-home-group android-home-attention":"android-home-group"}><HoldAxisButton activation="hold" disabled={!homingEnabled} actionKey="viewport-home" aria-label="Home machine" title="Hold to home" onActivate={homeMachine}><Home size={19}/></HoldAxisButton>{needsHome&&<span className="android-home-label">Not homed</span>}</div><HoldAxisButton disabled={!allowed} activation="hold" actionKey="viewport-zero" aria-label="Zero all axes" title="Hold to zero all axes" onActivate={zeroAllAxes}><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><ellipse cx="10" cy="10" rx="5" ry="7"/><path d="M4 17 16 3"/></svg><span>All</span></HoldAxisButton></div>}<div className="android-view-actions"><button className="android-center-position" aria-label="Center viewport on machine position" title={tracking?'Tracking machine position · tap to stop':'Center on machine position · hold to track'} aria-pressed={tracking} data-holding={holding}
 onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);held.current=false;setHolding(true);holdTimer.current=setTimeout(()=>{held.current=true;setHolding(false);setTracking(true);},600);}}
 onPointerUp={cancelHold} onPointerCancel={()=>{held.current=true;cancelHold();}} onLostPointerCapture={cancelHold}
 onContextMenu={e=>e.preventDefault()}
 onClick={()=>{if(held.current){held.current=false;return;}if(tracking)setTracking(false);else center();}}><Crosshair size={20}/></button><button aria-label="Fit job in viewport" title="Fit job" disabled={!loaded} onClick={()=>{setTracking(false);center('job');}}><Scan size={20}/></button><button aria-label="Fit machine in viewport" title="Fit machine" onClick={()=>{setTracking(false);center('machine');}}><Maximize size={20}/></button></div></>;
}
function RotaryDial(){
    const enabled=useRotaryEnabled();
    const angle=useTypedSelector(s=>s.controller.wpos?.a);
    if(!enabled)return null;
    const value=Number(angle??0), rotation=((value%360)+360)%360;
    const open=(element:SVGRectElement)=>window.dispatchEvent(new CustomEvent('android-edit-readout',{detail:{axis:'A',rect:element.getBoundingClientRect().toJSON()}}));
    return <div className="android-rotary-dial"><svg viewBox="18 18 144 144" aria-label={`Rotary position ${value.toFixed(2)} degrees`}>
        <g transform="translate(90 90) scale(0.92) translate(-90 -90)">
        <g transform={`rotate(${-rotation} 90 90)`} data-rotary-ring="true">
            <circle cx="90" cy="90" r="63" fill="none" stroke="currentColor" strokeWidth="1" opacity=".65"/>
            {Array.from({length:24},(_,i)=>{const a=i*Math.PI/12,major=i%6===0,r=major?55:58;return <line key={i} x1={90+Math.sin(a)*r} y1={90-Math.cos(a)*r} x2={90+Math.sin(a)*63} y2={90-Math.cos(a)*63} stroke="currentColor" strokeWidth={major?2:1} opacity={major?.85:.4}/>;})}
            <circle cx="90" cy="27" r="6" fill="#94a3b8" stroke="#64748b" strokeWidth="1"/>
        </g>
        {[0,90,180,270].map(degrees=>{const a=(degrees-rotation)*Math.PI/180,x=90+Math.sin(a)*48,y=90-Math.cos(a)*48;const textAngle=degrees-rotation;return <text key={degrees} className="rotary-tick-label" style={{dominantBaseline:"central",textAnchor:"middle"}} transform={`rotate(${textAngle} ${x} ${y})`} x={x} y={y} textAnchor="middle" dominantBaseline="central"><tspan x={x}>{degrees}</tspan><tspan x={x+String(degrees).length*3.01} style={{textAnchor:"start"}}>°</tspan></text>;})}
        </g>
        <path d="M83.5 20.5 H96.5 L90 31.5 Z" fill="currentColor"/>
        <g className="rotary-turn-counter" transform="translate(89 -14)" aria-label={`${Math.trunc(value/360)} complete rotations`}>
            <circle cx="35" cy="145" r="17" fill="var(--rotary-counter-bg,#f8fafc)" stroke="#72849d" strokeWidth="1"/>
            {Array.from({length:10},(_,i)=>{const a=i*Math.PI/5;return <line key={i} x1={35+Math.sin(a)*13} y1={145-Math.cos(a)*13} x2={35+Math.sin(a)*16} y2={145-Math.cos(a)*16} stroke="currentColor" strokeWidth=".8"/>;})}
            <g transform={`rotate(${value/10} 35 145)`}>
                <line x1="35" y1="129" x2="35" y2="134" stroke="#f1f5f9" strokeWidth="2" strokeLinecap="round"/>
            </g>

            <text x="35" y="141" textAnchor="middle" dominantBaseline="central" style={{fontSize:11}}>{Math.trunc(value/360)}</text>
            <text x="35" y="152" textAnchor="middle" dominantBaseline="central" style={{fontSize:7}}>REV</text>
        </g>
        <g className="rotary-readout">
            <rect x="48" y="68" width="84" height="44" rx="5" role="button" tabIndex={0} aria-label="Edit visualizer A coordinate"
                onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();open(e.currentTarget);}}
                onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(e.currentTarget);}}}/>
            <text x="90" y="80" dominantBaseline="central" textAnchor="middle">A:</text>
            <text x="90" y="100" dominantBaseline="central" textAnchor="middle">{value.toFixed(2)}</text>
        </g>
    </svg></div>;
}
export default memo(function ZHeightScale(){
    const connected=useTypedSelector(s=>s.connection.isConnected);
    const travel=useTypedSelector(s=>s.controller.settings?.settings?.$132);
    const homeDirection=useTypedSelector(s=>s.controller.settings?.settings?.$23);
    const forceOrigin=useTypedSelector(s=>s.controller.homingFlag);
    const homed=useTypedSelector(s=>s.controller.hasHomed);
    // Do not show the Redux initial zero as a measured position before the first status report.
    const machineZ=useTypedSelector(s=>s.controller.state.status?.mpos?.z == null ? null : s.controller.mpos?.z);
    const workZ=useTypedSelector(s=>s.controller.state.status?.wpos?.z == null ? null : s.controller.wpos?.z);
    const fileLoaded=useTypedSelector(s=>s.file.fileLoaded && !s.file.fileProcessing);
    const jobMin=useTypedSelector(s=>s.file.bbox?.min?.z);
    const jobMax=useTypedSelector(s=>s.file.bbox?.max?.z);
    const {units}=useWorkspaceState();
    const ref=useRef<HTMLDivElement>(null),[height,setHeight]=useState(320);
    useLayoutEffect(()=>{const element=ref.current;if(!element)return;const update=()=>setHeight(Math.max(110,Math.round(element.getBoundingClientRect().height)));
        const observer=new ResizeObserver(update);observer.observe(element);update();return()=>observer.disconnect();},[]);
    const model=zHeightModel({connected,travel,homeDirection,forceOrigin,machineZ,workZ,fileLoaded,jobMin,jobMax});
    return <><CrosshairSpindleIndicator/><ViewportActions/><RotaryDial/><div ref={ref} className="android-z-height-scale" style={{visibility:model?'visible':'hidden'}}><ZHeightRuler model={model} units={units??'mm'} height={height} homed={homed}/></div></>;
});

function CrosshairSpindleIndicator(){
 const modal=useTypedSelector(s=>s.controller.modal.spindle);
 const rpm=useTypedSelector(s=>s.controller.state.status?.spindle);
 const laser=useTypedSelector(s=>Number(s.controller.settings?.settings?.$32??0)===1);
 const [host,setHost]=useState<Element|null>(null);
 const commanded=modal==='M3'||modal==='M4';
 const moving=Number(rpm)>0;
 const phase=commanded?(moving?'running':'starting'):(moving?'stopping':'off');
 const direction=useRef('M3');
 if(commanded)direction.current=modal;
 useLayoutEffect(()=>{
  const find=()=>setHost(document.querySelector('.android-crosshair-indicator-anchor'));
  const observer=new MutationObserver(find);
  observer.observe(document.querySelector('.android-visualizer-canvas')||document.body,{childList:true,subtree:true});
  find();return()=>observer.disconnect();
 },[]);
 const label=laser?(commanded&&moving?'Laser on':'Laser off'):'Spindle '+phase+' '+(direction.current==='M4'?'counterclockwise':'clockwise');
 return host?createPortal(<g className={'android-crosshair-indicator '+(!laser?phase:'laser')} role="img" aria-label={label}>
  {laser?<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2" fill={commanded&&moving?'#ef4444':'#8793a2'}/></svg>:phase!=='off'&&<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{transform:direction.current==='M4'?'scaleX(-1)':undefined}}><path d="M2 12 A10 10 0 0 1 12 2 M10 0.7 L12 2 L10 3.3"/></svg>}
 </g>,host):null;
}

function UnhomedIndicator(){
 const connected=useTypedSelector(s=>s.connection.isConnected);
 const homed=useTypedSelector(s=>s.controller.hasHomed);
 const [host,setHost]=useState<Element|null>(null);
 useLayoutEffect(()=>{setHost(document.querySelector('.android-machine-status-host'));},[]);
 return connected&&!homed&&host?createPortal(<span className="android-unhomed-status">Not homed</span>,host):null;
}
