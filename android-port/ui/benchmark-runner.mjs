// Repeatable viewport workload through the same renderer used by finger pan/zoom.
// Frame timings measure rendering responsiveness, not physical input latency.
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function distribution(values){const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:a.length,p50:a[Math.floor((a.length-1)*.5)]||0,p95:a[Math.floor((a.length-1)*.95)]||0,p99:a[Math.floor((a.length-1)*.99)]||0,max:a[a.length-1]||0,over50:a.filter(n=>n>50).length,over100:a.filter(n=>n>100).length};}
export async function viewportExercise(svg,{check,log,label,duration=6000}){
 const viewport=svg.__gsenderViewport;if(!viewport)throw Error('Visualizer pan/zoom adapter is unavailable');
 const startedAt=Date.now();log({event:'viewport_start',label,startedAt});
 const original=viewport.read(),frames=[],longTasks=[],redraws=[];let last=performance.now(),frameId,active=true;
 const tick=now=>{if(!active)return;frames.push(now-last);last=now;frameId=requestAnimationFrame(tick);};frameId=requestAnimationFrame(tick);
 let observer;try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push(e.duration);});observer.observe({entryTypes:['longtask']});}catch{}
 const rendered=e=>redraws.push(e.detail);document.addEventListener('gsender-benchmark-preview',rendered);
 let measuredZoom;
 try{
  const started=performance.now();
  await new Promise((resolve,reject)=>{function animate(now){try{check();const t=Math.min(1,(now-started)/duration),wave=Math.sin(t*Math.PI*2);viewport.write({...original,x:original.x+original.w*.18*wave,y:original.y+original.h*.12*Math.sin(t*Math.PI*4)});if(t>=1)resolve();else requestAnimationFrame(animate);}catch(e){reject(e);}}requestAnimationFrame(animate);});
  check();const zoom={x:original.x+original.w*.25,y:original.y+original.h*.25,w:original.w*.5,h:original.h*.5};viewport.write(zoom);
  // Dwell allows the preview worker to render at the requested zoom, rather
  // than cancelling every zoom request with the next animation frame.
  await sleep(8000);check();measuredZoom=viewport.read();
  if(Math.abs(measuredZoom.w-zoom.w)>1e-5)throw Error('Viewport zoom did not apply');
  viewport.write(original);await sleep(3000);check();
 }finally{
  viewport.write(original);active=false;cancelAnimationFrame(frameId);observer?.disconnect();document.removeEventListener('gsender-benchmark-preview',rendered);
  log({event:'viewport',label,startedAt,endedAt:Date.now(),frameGapMs:distribution(frames),longTaskMs:distribution(longTasks),startView:original,zoomView:measuredZoom,zoomFactor:measuredZoom?original.w/measuredZoom.w:null,redraws:redraws.slice(-30),method:'renderer pan plus 2x zoom with 8-second dwell; not native input latency'});
 }
}
export async function runSuite({api,session,state,update,log,check,exercise=viewportExercise}){
 const waitUntil=async(predicate,timeout,label)=>{const start=Date.now();while(!predicate()){check();if(Date.now()-start>timeout)throw Error(label+' timed out');await sleep(300);}};
 for(const fixture of session.fixtures){
  check();update('Loading '+fixture.label);const started=Date.now();
  const findSvg=()=>[...document.querySelectorAll('svg[data-gsender-viewport]')].find(e=>e.__gsenderViewport);
  const previousLoad=findSvg()?.dataset.benchmarkLoad;await api('load',{fixture:fixture.id});
  try {
   await waitUntil(()=>{
    const s=findSvg(),diagnostic=globalThis.__gsenderPreviewDiagnostic;
    if(diagnostic?.stage==='error'&&diagnostic.time>=started)throw Error('File preview failed: '+diagnostic.message);
    if(s&&s.dataset.benchmarkLoad!==previousLoad&&s.dataset.previewStatus==='error')throw Error('File preview failed: '+s.dataset.previewError);
    return s&&s.dataset.benchmarkLoad!==previousLoad&&s.dataset.previewStatus==='ready';
   },180000,'File preview');
  } catch(error) {
   log({event:'preview_failed',fixture:fixture.id,ms:Date.now()-started,message:String(error),diagnostic:globalThis.__gsenderPreviewDiagnostic,
    previewStatus:findSvg()?.dataset.previewStatus,ui:globalThis.__gsenderBenchmarkReadUI?.()});
   throw error;
  }
  const svg=findSvg();
  log({event:'load_ready',fixture:fixture.id,ms:Date.now()-started,previewMode:svg.dataset.previewMode});
  update(fixture.label+' · idle pan + zoom');await exercise(svg,{check,log,label:fixture.id+':idle'});
  update(fixture.label+' · streaming');await api('run');
  await waitUntil(()=>state().job?.event==='job_started'||state().job?.event==='job_completed',15000,'Job start');
  const streamStart=Date.now();let nextGesture=0,gestures=0;
  while(true){
   check();const current=state();if(current.job?.event==='job_completed')break;
   const elapsed=(Date.now()-streamStart)/1000;
   if(!fixture.full&&elapsed>=65){log({event:'partial_stream',fixture:fixture.id,seconds:elapsed,progress:current.progress});break;}
   if(elapsed>fixture.commands/500+120)throw Error('Streaming failed to finish at the expected rate');
   if(elapsed>=nextGesture){update(fixture.label+' · streaming pan + zoom');await exercise(svg,{check,log,label:fixture.id+':stream:'+gestures++});nextGesture=elapsed+(fixture.id==='mountain'?160:25);}
   await sleep(300);
  }
  if(fixture.full){const result=state().job;log({event:'verified_stream',fixture:fixture.id,result});if(!result?.expectedMatch||result.overflows)throw Error('Command verification failed for '+fixture.label);
   update(fixture.label+' · checking completion display');const finish=Date.now();let idle=false;
   while(Date.now()-finish<75000){check();if(globalThis.__gsenderBenchmarkReadUI?.().workflow==='idle'){idle=true;break;}await sleep(300);}
   log({event:'completion_display',fixture:fixture.id,idleObserved:idle,delayMs:Date.now()-result.time,ui:globalThis.__gsenderBenchmarkReadUI?.()});
  }
  await api('unload');await sleep(2000);
 }
}
