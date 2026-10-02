import pubsub from 'pubsub-js';
import {applyGcodeFile} from '../../src/pendant/src/utils/fileLoader';
import {toast} from 'app/lib/toaster';
import {createPortal} from 'react-dom';
import React,{useEffect,useState} from 'react';
import ConsolePanel from '../../src/pendant/src/components/ConsolePanel';
import ProbePanel from '../../src/pendant/src/components/ProbePanel';
import ATCPanel from '../../src/pendant/src/components/ATCPanel';
import {useTypedSelector} from 'app/hooks/useTypedSelector';
import ToolCard from 'app/components/ToolCard';
import {GiFlatPlatform} from 'react-icons/gi';
import {BiSolidCylinder} from 'react-icons/bi';
import PendantToolChange from './PendantToolChange';
import useAtcControls from './useAtcControls';
import PrepToolDialog from './PrepToolDialog';

export default function ToolPane(){
 // Keep the subscriber mounted when Surfacing navigates back before its async event arrives.
 useEffect(()=>{const token=pubsub.subscribe('gcode:surfacing',(_,payload)=>{void applyGcodeFile({content:payload.gcode,name:payload.name,size:payload.size}).catch(error=>toast.error(String(error)));});return()=>pubsub.unsubscribe(token);},[]);
 const loading=useTypedSelector(s=>s.file.fileProcessing);
 const connected=useTypedSelector(s=>s.connection.isConnected);
 const wizard=useTypedSelector(s=>s.helper.wizardActive);
 const atc=useAtcControls();
 const [tab,setTab]=useState('Tools');
 const [prep,setPrep]=useState<string|null>(null);
 const [host,setHost]=useState<Element|null>(null);
 const [canvasHost,setCanvasHost]=useState<Element|null>(null);
 useEffect(()=>{setHost(document.querySelector('.android-position-card')||null);},[]);
 useEffect(()=>{if(wizard)setTab('Tools');},[wizard]);
 useEffect(()=>{document.body.classList.toggle('android-file-loading',Boolean(loading));return()=>document.body.classList.remove('android-file-loading');},[loading]);
 useEffect(()=>{document.body.classList.toggle('android-disconnected',!connected);return()=>document.body.classList.remove('android-disconnected');},[connected]);
 useEffect(()=>{
  const canvas=document.querySelector<HTMLElement>('.android-visualizer-canvas');
  const button=document.querySelector<HTMLElement>('.android-connection-pill');if(!canvas)return;setCanvasHost(canvas);
  const align=()=>{canvas.style.setProperty('--loaded-file-max',canvas.clientWidth/3+'px');if(button){const c=canvas.getBoundingClientRect(),b=button.getBoundingClientRect();const scale=c.width/canvas.offsetWidth;if(scale)canvas.style.setProperty('--connection-arrow-x',((b.left+b.width/2-c.left)/scale)+'px');}};
  const observer=new ResizeObserver(align);observer.observe(canvas);if(button)observer.observe(button);window.addEventListener('resize',align);align();
  return()=>{observer.disconnect();window.removeEventListener('resize',align);};
 },[]);
 useEffect(()=>{if(!connected)setTab('Console');},[connected]);
 return host?<>{!connected&&canvasHost&&createPortal(<p className="android-connect-hint">Connect machine to continue</p>,canvasHost)}{createPortal(<section className="android-tool-pane" aria-label="Tool pane">
 <div role="tablist" aria-label="Tool pane tabs">{['Probing','Prep','Tools','Console'].map(name=><button key={name} id={'tool-tab-'+name} role="tab" aria-selected={tab===name} aria-controls={'tool-panel-'+name} onClick={()=>setTab(name)}>{name}</button>)}</div>
 <div className="android-tool-pane-body">
 <div role="tabpanel" id="tool-panel-Tools" aria-labelledby="tool-tab-Tools" hidden={tab!=='Tools'}>
 <div hidden={!atc||wizard}><ATCPanel mode={atc&&tab==='Tools'?'expanded':'closed'}/></div>
 {!atc&&!wizard&&<p className="android-tool-pane-empty">No tool change active.</p>}
 <PendantToolChange />
 </div>
 {tab==='Console'&&<div role="tabpanel" id="tool-panel-Console" aria-labelledby="tool-tab-Console" className="h-full min-h-0"><ConsolePanel className="h-full min-h-0" isActive/><button className="android-console-corner-expand" type="button" aria-label="Expand console into tray" onClick={()=>{const button=Array.from(document.querySelectorAll<HTMLButtonElement>('.android-bottom-nav button')).find(b=>b.textContent?.trim()==='Console');button?.click();}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17 17 7M7 7h10v10"/></svg></button></div>}
 {tab==='Probing'&&<div role="tabpanel" id="tool-panel-Probing" aria-labelledby="tool-tab-Probing"><ProbePanel mode="expanded"/></div>}
 {tab==='Prep'&&<div role="tabpanel" id="tool-panel-Prep" aria-labelledby="tool-tab-Prep" className="android-prep-tools"><ToolCard title="Surfacing" icon={GiFlatPlatform} onClick={()=>setPrep('Surfacing')}/><ToolCard title="Rotary Surfacing" icon={BiSolidCylinder} onClick={()=>setPrep('Rotary Surfacing')}/></div>}
 </div>{prep&&<PrepToolDialog tool={prep} onClose={()=>setPrep(null)}/>}</section>,host)}</>:null;
}
