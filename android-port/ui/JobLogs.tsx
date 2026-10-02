import {useEffect, useState} from 'react';
import store from 'app/store/redux';
const w = window as any;
const button = {background:'#2563eb',color:'#fff',border:'1px solid #60a5fa',borderRadius:6,padding:'10px 18px',minHeight:44};
async function api(route = '', body?:any) {
    const response = await fetch('/api/job-logs' + route, body ? {method:'POST',headers:{'Content-Type':'application/json','X-gSender-Job-Log':'1'},body:JSON.stringify(body)} : {cache:'no-store'});
    if (!response.ok) throw Error('Could not read job logs');
    return response.json();
}
export default function JobLogs() {
    const [visible, setVisible] = useState(false), [reports, setReports] = useState<any[]>([]), [message, setMessage] = useState('');
    const refresh = async () => {try {const data=await api();setReports(data.reports);setMessage(data.error || '');} catch(e) {setMessage(String(e));}};
    useEffect(() => {
        let disposed=false, busy=false, frame=0, previous=0, frames=0, frameTotal=0, maxGap=0, active=false;
        const tick=(time:number)=>{if(previous){const gap=time-previous;frames++;frameTotal+=gap;maxGap=Math.max(maxGap,gap);}previous=time;if(active&&!document.hidden)frame=requestAnimationFrame(tick);};
        const setActive=(value:boolean)=>{if(value===active)return;active=value;cancelAnimationFrame(frame);previous=0;frames=0;frameTotal=0;maxGap=0;if(active&&!document.hidden)frame=requestAnimationFrame(tick);};
        const poll=async()=>{
            if(busy||disposed)return;busy=true;
            try {
                const status=await api('/status');if(disposed)return;setActive(Boolean(status.active));
                if(status.active){
                    let native={};try{native=JSON.parse(w.AndroidBenchmark?.sample()||'{}');}catch{}
                    const sample={native,visible:!document.hidden,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
                        jsHeap:(performance as any).memory?.usedJSHeapSize,frameCallbacks:frames,frameMeanMs:frames?frameTotal/frames:null,frameMaxMs:frames?maxGap:null,
                        preview:w.__gsenderPreviewDiagnostic};
                    frames=0;frameTotal=0;maxGap=0;
                    await api('/sample',{id:status.active.id,sample});
                }
            } catch {setActive(false);} finally {busy=false;}
        };
        const timer=setInterval(()=>void poll(),5000);
        let workflow=store.getState().controller.workflow.state;
        const unsubscribe=store.subscribe(()=>{const next=store.getState().controller.workflow.state;if(next!==workflow){workflow=next;void poll();}});
        const visibility=()=>{cancelAnimationFrame(frame);previous=0;if(active&&!document.hidden)frame=requestAnimationFrame(tick);};
        const open=()=>{setVisible(true);void refresh();};
        document.addEventListener('visibilitychange',visibility);window.addEventListener('gsender-job-logs-open',open);
        if(new URLSearchParams(location.search).has('joblogs'))open();
        void poll();
        return()=>{disposed=true;active=false;clearInterval(timer);cancelAnimationFrame(frame);unsubscribe();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('gsender-job-logs-open',open);};
    },[]);
    const exportReport=async(id:string)=>{try{
        const data=await api('/report/'+id),name=`gSender-build-${data.summary.build}-job-${id.slice(0,8)}.json`,blob=new Blob([JSON.stringify(data)],{type:'application/json'});
        if(w.AndroidDownload){const reader=new FileReader();reader.onload=()=>w.AndroidDownload.save(name,String(reader.result).split(',')[1]);reader.readAsDataURL(blob);}
        else {const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(e){setMessage(String(e));}};
    if(!visible)return null;
    return <div role="dialog" aria-label="Machine job logs" style={{position:'fixed',inset:0,zIndex:2147483000,background:'#0009',display:'grid',placeItems:'center',padding:12}}>
        <section style={{background:'#152238',color:'#fff',padding:20,borderRadius:8,width:'min(720px,95vw)',maxHeight:'85vh',overflow:'auto'}}>
            <h2>Machine job logs</h2><p>Jobs are logged automatically on this tablet. The latest 12 logs are retained, with up to 8 MiB of events each. Export a log to share it.</p>
            {message&&<p role="status">{message}</p>}
            {!reports.length&&<p>No recorded jobs yet.</p>}
            {reports.map(r=><div key={r.id} style={{display:'flex',gap:12,alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderTop:'1px solid #475569'}}><span>{r.file?.name||'Job'}<br/><small>{new Date(r.started).toLocaleString()} · {r.status}{r.droppedRecords?' · some events omitted':''}</small></span><button style={button} onClick={()=>void exportReport(r.id)}>Export JSON</button></div>)}
            <div style={{display:'flex',gap:12,marginTop:16}}><button style={button} onClick={()=>void refresh()}>Refresh</button><button style={button} onClick={()=>setVisible(false)}>Close</button></div>
        </section>
    </div>;
}
