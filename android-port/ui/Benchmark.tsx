import {useEffect,useRef,useState} from 'react';
import controller from 'app/lib/controller';
import store from 'app/store/redux';
import {runSuite,sleep} from './benchmark-runner.mjs';
const w=window as any;
async function request(action='',body?:any){const r=await fetch('/api/benchmark'+(action?'/'+action:''),body?{method:'POST',headers:{'Content-Type':'application/json','X-gSender-Benchmark':'1'},body:JSON.stringify(body)}:{cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Benchmark request failed');return data;}
function nativeSample(){try{return {...JSON.parse(w.AndroidBenchmark?.sample()||'{}'),viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},jsHeap:(performance as any).memory?.usedJSHeapSize};}catch{return {};}}
const button={background:'#2563eb',color:'white',border:'1px solid #60a5fa',borderRadius:6,padding:'10px 18px',minHeight:44,cursor:'pointer'};
export default function Benchmark({onCarve,onActive}:{onCarve:()=>void,onActive:(v:boolean)=>void}){
 const [visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[reports,setReports]=useState<any[]>([]);
 const session=useRef<any>(null),cancelled=useRef(false);
 const refresh=async()=>{try{const result=await request();setReports(result.reports);if(result.active&&!session.current)setMessage('An interrupted screen is still running a benchmark. Close and reopen the app to stop it.');}catch(e){setMessage(String(e));}};
 useEffect(()=>{const open=()=>{setVisible(true);void refresh();};window.addEventListener('gsender-benchmark-open',open);
  if(new URLSearchParams(location.search).get('benchmark')==='onboard')open();
  w.__gsenderBenchmarkReadUI=()=>{const s=store.getState();return {workflow:s.controller.workflow.state,fileLoaded:s.file.fileLoaded,connection:s.connection.port,fileProcessing:s.file.fileProcessing,processingProgress:s.file.processingProgress};};
  const hidden=()=>{if(document.hidden&&session.current){cancelled.current=true;void request('stop',{id:session.current.id}).catch(()=>{});}};
  document.addEventListener('visibilitychange',hidden);
  return()=>{hidden();window.removeEventListener('gsender-benchmark-open',open);document.removeEventListener('visibilitychange',hidden);delete w.__gsenderBenchmarkReadUI;};
 },[]);
 async function run(profile:string){
  let timer:any=null,events:any[]=[],latest:any={},polling=false,polls=0,pollFailure='',started=false,unsubscribe=()=>{};
  const log=(event:any)=>{events.push({...event,time:Date.now()});if(events.length>100)events.shift();};
  const diagnostic=(event:any)=>log({event:'preview_stage',...event.detail});
  const flush=async()=>{if(events.length&&session.current){const batch=events.splice(0,25);await request('log',{id:session.current.id,events:batch});}};
  const check=()=>{if(cancelled.current)throw Error('Stopped by user or app left foreground');if(pollFailure)throw Error(pollFailure);};
  try{
   setBusy(true);setMessage('Starting offline simulator…');cancelled.current=false;
   const opened=await request('start',{profile,device:nativeSample()});session.current=opened;started=true;
   w.__gsenderBenchmarkActive=true;onActive(true);onCarve();
   document.addEventListener('gsender-preview-diagnostic',diagnostic);
   let previousWorkflow=store.getState().controller.workflow.state;
   unsubscribe=store.subscribe(()=>{const workflow=store.getState().controller.workflow.state;if(workflow!==previousWorkflow){previousWorkflow=workflow;log({event:'workflow_changed',workflow});}});
   const api=(action:string,body={})=>request(action,{...body,id:opened.id});
   const poll=async()=>{if(polling)return;polling=true;try{const requested=Date.now();latest=await api('heartbeat',++polls%5===1?{sample:nativeSample()}:{});log({event:'heartbeat_latency',requestMs:Date.now()-requested,responseAgeMs:Date.now()-latest.serverTime});if(latest.status!=='running')pollFailure='Benchmark stopped: '+latest.status;await flush();}catch(e){pollFailure=String(e);}finally{polling=false;}};
   timer=setInterval(()=>void poll(),1000);await poll();
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Simulated CNC connection timed out')),20000);controller.openPort('127.0.0.1',{network:true,ethernetPort:opened.port,baudrate:115200,defaultFirmware:'GrblHAL'},(err:any)=>{clearTimeout(timeout);err?reject(Error(String(err))):resolve();});});
   // Connection callback includes firmware detection; allow status/UI state to settle.
   await sleep(2500);check();
   await runSuite({api,session:opened,state:()=>latest,update:setMessage,log,check});
   await flush();await api('finish',{success:true,reason:'All selected cases completed'});setMessage('Benchmark complete. Export the report below.');
  }catch(e){setMessage(String(e));if(started)try{await flush();await request('finish',{id:session.current.id,success:false,reason:String(e)});}catch{}}
  finally{clearInterval(timer);unsubscribe();document.removeEventListener('gsender-preview-diagnostic',diagnostic);session.current=null;w.__gsenderBenchmarkActive=false;onActive(false);setBusy(false);await refresh();}
 }
 async function exportReport(id:string){try{const data=await request('report/'+id),text=JSON.stringify(data,null,2),blob=new Blob([text],{type:'application/json'});const model=String(data.summary.device?.model||'tablet').replace(/[^a-zA-Z0-9_-]/g,'-');const name=`gSender-build-${data.summary.build}-${model}-benchmark-${id.slice(0,8)}.json`;
  if(w.AndroidDownload){const reader=new FileReader();reader.onload=()=>w.AndroidDownload.save(name,String(reader.result).split(',')[1]);reader.readAsDataURL(blob);}else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
 }catch(e){setMessage(String(e));}}
 if(!visible)return null;
 return <div style={{position:'fixed',inset:0,zIndex:2147483000,background:busy?'transparent':'#0009',display:'flex',alignItems:busy?'flex-end':'center',justifyContent:'center',padding:12}} role="dialog" aria-label="Onboard benchmark">
  <section style={{background:'#152238',color:'#fff',border:'1px solid #60a5fa',borderRadius:8,padding:18,width:busy?'100%':640,maxHeight:'90vh',overflow:'auto',boxShadow:'0 2px 12px #0008'}}>
   <h2 style={{fontSize:22,marginBottom:8}}>Benchmark · Build {w.__gsenderAndroidBuildNumber}</h2>
   <p style={{marginBottom:10}}>{busy?'SIMULATION — physical CNC connections blocked. Keep gSender open.': 'Runs offline on this tablet. Disconnect the CNC and knob and unload any job first. Reports are saved on the tablet, including interrupted runs.'}</p>
   {message&&<p role="status" style={{marginBottom:12,color:'#bfdbfe'}}>{message}</p>}
   {busy?<button style={button} onClick={()=>{cancelled.current=true;setMessage('Stopping…');if(session.current)void request('stop',{id:session.current.id}).catch(()=>{});}}>Stop benchmark</button>:<>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:14}}>
     <button style={button} onClick={()=>void run('quick')}>Quick check · about 3 min</button>
     <button style={button} onClick={()=>void run('full')}>Full suite · about 25 min</button>
     <button style={{...button,background:'#334155'}} onClick={()=>setVisible(false)}>Close</button>
    </div>
    <p style={{fontSize:14,marginBottom:12}}>Includes loading, streaming, panning and 2× viewport zoom. Full suite: contour, arcs, mountain relief and 5–40 MiB relief files. Automated animation measures rendering, not finger response time. Stops if available system memory falls below 256 MiB. Last 12 sessions retained.</p>
    {reports.map(r=><div key={r.id} style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #475569'}}><span>{new Date(r.started).toLocaleString()} · {r.profile} · {r.status}<br/><small>{r.reason||r.current||''}</small></span><button style={button} onClick={()=>void exportReport(r.id)}>Export JSON</button></div>)}
   </>}
  </section>
 </div>;
}
