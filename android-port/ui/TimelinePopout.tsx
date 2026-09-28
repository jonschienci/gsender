import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
export default function TimelinePopout({children,tools=[],activeIndex=0}:{children:React.ReactNode;tools:any[];activeIndex:number}){
 const [host,setHost]=useState<Element|null>(null);
 const [open,setOpen]=useState(false);
 useEffect(()=>{setHost(document.getElementById('android-job-summary-host')?.parentElement||null);},[]);
 return host?createPortal(<section className="android-timeline-popout" data-open={open} aria-label="Tool Timeline">
 {open?<div className="android-timeline-content">{children}</div>:<div className="android-timeline-squares">{tools.map((tool,index)=><button key={`${tool.toolNumber}-${index}`} aria-label={`Tool ${tool.toolNumber}${index===activeIndex?', current tool':''}`} aria-current={index===activeIndex?'step':undefined} onClick={()=>setOpen(true)} style={{backgroundColor:tool.color,'--tool-color':tool.color} as React.CSSProperties}>{tool.index ?? index + 1} : T{tool.toolNumber}</button>)}</div>}
 <button className="android-timeline-toggle" aria-expanded={open} onClick={()=>setOpen(!open)}>Tool Timeline <span>{open?'‹':'›'}</span></button>
 </section>,host):null;
}
