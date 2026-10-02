import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
export default function TimelinePopout({children,tools=[],activeIndex=0}:{children:React.ReactNode;tools:any[];activeIndex:number}){
 const [host,setHost]=useState<Element|null>(null);
 const [open,setOpen]=useState(false);
 const [paneHeight,setPaneHeight]=useState(0);
 useEffect(()=>{if(!open)return;const closeOutside=(event:PointerEvent)=>{if(!(event.target as Element).closest('.android-tool-flags'))setOpen(false);};document.addEventListener('pointerdown',closeOutside);return()=>document.removeEventListener('pointerdown',closeOutside);},[open]);
 useEffect(()=>{if(!host)return;const measure=()=>setPaneHeight(host.clientHeight);const observer=new ResizeObserver(measure);observer.observe(host);measure();return()=>observer.disconnect();},[host]);
 const [progress,setProgress]=useState<Element|null>(null);
 useEffect(()=>{const find=()=>setProgress(document.querySelector('.android-job-progress:not(.android-timeline-anchor)'));const observer=new MutationObserver(find);observer.observe(document.body,{childList:true,subtree:true});find();return()=>observer.disconnect();},[]);
 const [fallback,setFallback]=useState<HTMLDivElement|null>(null);
 const target=progress||fallback;
 const [progressWidth,setProgressWidth]=useState(490);
 useEffect(()=>{if(!target)return;const measure=()=>setProgressWidth(target.clientWidth);const observer=new ResizeObserver(measure);observer.observe(target);measure();return()=>observer.disconnect();},[target]);
 const total=Math.max(1,...tools.map(t=>Number(t.endLine)||0));
 useEffect(()=>{setHost(document.getElementById('android-job-summary-host')?.parentElement||null);},[]);
 let labelEnd=-6;
 const labelOffsets=tools.map(tool=>{const stem=(Number(tool.startLine)-1)/total*progressWidth;const left=Math.max(stem,labelEnd+6);labelEnd=left+String('T'+tool.toolNumber).length*8;return left-stem;});
 return host?<>{!progress&&createPortal(<div ref={setFallback} className="android-job-progress android-timeline-anchor"/>,host)}{target&&createPortal(<div className="android-tool-flags" onClick={event=>{event.stopPropagation();if(!open)setOpen(true);}} data-open={open} style={{'--timeline-top':open?`${-Math.max(44,paneHeight-(progress?66:76))}px`:'-44px'} as React.CSSProperties} aria-label="Tool change chapters">{tools.map((tool,index)=><div className="android-tool-flag" key={index} style={{left:((Number(tool.startLine)-1)/total*100)+'%',width:(((index+1<tools.length?Number(tools[index+1].startLine)-1:total)-(Number(tool.startLine)-1))/total*100)+'%',height:'18px',zIndex:index===activeIndex?tools.length+1:tools.length-index,'--tool-color':tool.color} as React.CSSProperties}><button title={`Tool ${tool.toolNumber} · Line ${tool.startLine}`} aria-label={`Tool ${tool.toolNumber}, line ${tool.startLine}`} aria-current={index===activeIndex?'step':undefined} onClick={event=>{event.stopPropagation();setOpen(!open);}} style={{backgroundColor:tool.color}}><span style={{left:labelOffsets[index]}}>T{tool.toolNumber}</span></button></div>)}{open&&<div className="android-tool-expanded-content">{children}</div>}<button className="android-tool-flags-heading" aria-expanded={open} onClick={event=>{event.stopPropagation();setOpen(!open);}} aria-label={open?'Collapse tool timeline':'Expand tool timeline'}><span>{open?'⌄':'⌃'}</span></button></div>,target)}{!target&&createPortal(<section className="android-timeline-popout" data-open={open} data-flags={!!target} aria-label="Tool Timeline">
 {open?<div className="android-timeline-content">{children}</div>:<div className="android-timeline-squares">{tools.map((tool,index)=><button key={`${tool.toolNumber}-${index}`} aria-label={`Tool ${tool.toolNumber}${index===activeIndex?', current tool':''}`} aria-current={index===activeIndex?'step':undefined} onClick={()=>setOpen(true)} style={{backgroundColor:tool.color,'--tool-color':tool.color} as React.CSSProperties}>{tool.index ?? index + 1} : T{tool.toolNumber}</button>)}</div>}
 <button className="android-timeline-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>Tool Timeline <span>{open?'⌄':'⌃'}</span></button>
 </section>,host)}</>:null;
}
