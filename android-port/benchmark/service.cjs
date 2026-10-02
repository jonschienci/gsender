'use strict';
const fs=require('node:fs');const path=require('node:path');const {Worker}=require('node:worker_threads');
const {promisify}=require('node:util');const gunzip=promisify(require('node:zlib').gunzip);const {createHash,randomUUID}=require('node:crypto');
const {monitorEventLoopDelay}=require('node:perf_hooks');const gate=require('./gate.cjs');
const manifest=require('./fixture-manifest.cjs').load(__dirname);
let engine,getControllers,forgetController,run,worker,timer,lag,lastBeat,stopping=false;
const root=()=>path.join(process.env.GSENDER_USER_DATA,'benchmarks');
const folder=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid report ID');return path.join(root(),id);};
function atomicSummary(dir,value){const file=path.join(dir,'summary.json'),temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2));fs.renameSync(temp,file);}
function save(){if(run)atomicSummary(folder(run.id),run);}
function log(event,data={}){if(!run)return;const record={time:Date.now(),event,...data};const line=JSON.stringify(record)+'\n';
 if(Buffer.byteLength(line)>16384)return;if(run.logBytes+Buffer.byteLength(line)>8*1024*1024)return;
 fs.appendFileSync(path.join(folder(run.id),'events.ndjson'),line);run.logBytes+=Buffer.byteLength(line);
}
function recover(keep=12){fs.mkdirSync(root(),{recursive:true});for(const id of fs.readdirSync(root())){try{const p=path.join(folder(id),'summary.json'),s=JSON.parse(fs.readFileSync(p));if(s.status==='running'){s.status='interrupted';s.reason='App stopped before benchmark finished';s.ended=Date.now();atomicSummary(folder(id),s);}}catch{}}
 const all=fs.readdirSync(root()).filter(x=>/^[a-f0-9-]{36}$/.test(x)).map(id=>({id,at:fs.statSync(folder(id)).mtimeMs})).sort((a,b)=>b.at-a.at);
 for(const item of all.slice(keep))fs.rmSync(folder(item.id),{recursive:true,force:true});
}
function controller(){const c=getControllers?.()?.['127.0.0.1'];if(!c||!c.isOpen())throw Error('Simulated CNC is not connected');return c;}
async function stop(status='cancelled',reason='Stopped by user'){
 if(!run||run.status!=='running'||stopping)return;stopping=true;clearInterval(timer);lag?.disable();
 log('session_end',{status,reason});run.status=status;run.reason=reason;run.ended=Date.now();save();
 const c=getControllers?.()?.['127.0.0.1'];
 for(const cleanup of [()=>c?.workflow?.stop(),()=>c?.sender?.unload(),()=>engine?.unload(),()=>engine?.connection?.close(),()=>{engine.connection=null;},()=>c?.close(()=>{}),()=>c?.destroy(),()=>forgetController?.()]){try{cleanup();}catch(e){log('cleanup_error',{message:e.message});}}
 const old=worker;worker=null;try{await old?.terminate();}finally{gate.finish();stopping=false;save();}
}
async function start(profile,device){
 if(!engine)throw Error('Backend is starting');const selected=require('./fixture-manifest.cjs').select(manifest,profile);
 if(engine.connection&&!engine.connection.isClose())throw Error('Disconnect the CNC before starting');
 if(engine.gcode)throw Error('Unload the current job before starting the benchmark');
 gate.acquire();
 try{recover(11);run={id:randomUUID(),schema:1,build:JSON.parse(fs.readFileSync(path.join(__dirname,'build.json'))).build,profile,device,started:Date.now(),status:'running',logBytes:0,cases:[],
 limits:{rate:500,largeJobWindowSeconds:65,minimumAvailableMiB:256},
 scope:'Onboard loopback simulator shares tablet CPU/RAM. Automated viewport animation, not physical touch latency. Native PSS excludes isolated WebView renderer; system available memory covers whole device.',
 fixtures:selected};
 fs.mkdirSync(folder(run.id),{recursive:true});save();log('session_start',{profile,device});lastBeat=Date.now();
 worker=new Worker(path.join(__dirname,'worker.cjs'));
 const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Simulator startup timed out')),15000);worker.on('message',m=>{if(m.event==='ready'){clearTimeout(timeout);gate.state.port=m.port;resolve(m.port);}});worker.once('error',reject);});
 worker.on('message',m=>{if(!run||run.status!=='running')return;log(m.event,m);if(m.event==='job_started')run.job={...m};if(m.event==='job_progress')run.progress=m;if(m.event==='job_completed'){run.job=m;run.cases.push(m);save();}});
 worker.on('error',e=>void stop('failed','Simulator: '+e.message));worker.on('exit',code=>{if(worker&&run?.status==='running')void stop('failed','Simulator exited: '+code);});
 const port=await ready;lag=monitorEventLoopDelay({resolution:20});lag.enable();let previous=process.cpuUsage();
 timer=setInterval(()=>{const cpu=process.cpuUsage(),usage=process.memoryUsage();log('backend_sample',{memory:usage,cpuUserMicros:cpu.user-previous.user,cpuSystemMicros:cpu.system-previous.system,eventLoopP95Ms:lag.percentile(95)/1e6,eventLoopMaxMs:lag.max/1e6});previous=cpu;lag.reset();save();if(Date.now()-lastBeat>60000)void stop('interrupted','UI heartbeat expired');},5000);
 return {id:run.id,port,fixtures:run.fixtures};
 }catch(e){await stop('failed',e.message);gate.finish();throw e;}
}
async function load(id){
 const loadingRun=run;const f=run.fixtures.find(x=>x.id===id);if(!f)throw Error('Unknown fixture');
 const c=controller();c.workflow.stop();c.sender.unload();engine.unload();run.job=null;run.progress=null;
 const started=Date.now();const data=await gunzip(await fs.promises.readFile(path.join(__dirname,'fixtures',f.file+'.gz')));
 if(run!==loadingRun||run.status!=='running')throw Error('Benchmark ended');
 if(data.length!==f.bytes||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Fixture integrity check failed');
 await new Promise((resolve,reject)=>{const w=worker,t=setTimeout(()=>{w.off('message',handler);reject(Error('Simulator fixture timeout'));},5000);function handler(m){if(m.event==='fixture-ready'&&m.id===id){clearTimeout(t);w.off('message',handler);resolve();}}w.on('message',handler);w.postMessage({type:'fixture',fixture:f});});
 if(run!==loadingRun||run.status!=='running')throw Error('Benchmark ended');run.current=id;
 log('fixture_load',{id,bytes:f.bytes,decompressMs:Date.now()-started});
 // Scope event/macro suppression to this disposable simulator controller only.
 c.event.trigger=()=>{};c.event.hasEnabledEvent=()=>false;
 engine.load({port:'127.0.0.1',gcode:data.toString('utf8'),name:f.file,size:f.bytes,visualizer:true});save();return {id,started};
}
exports.attach=(e,get,forget)=>{engine=e;getControllers=get;forgetController=forget;recover();};
exports.stop=stop;exports.start=start;exports.manifest=manifest;
exports.installRoutes=app=>{
 const express=require('express');
 app.get('/api/benchmark',(_req,res)=>{res.set('Cache-Control','no-store');try{recoverIfIdle();res.json({localFixtures:manifest.filter(f=>f.profile==='local-real-job').map(({id,label})=>({id,label})),active:run?.status==='running',run:run||null,reports:fs.existsSync(root())?fs.readdirSync(root()).filter(x=>/^[a-f0-9-]{36}$/.test(x)).map(id=>{try{return JSON.parse(fs.readFileSync(path.join(folder(id),'summary.json')));}catch{return null;}}).filter(Boolean).sort((a,b)=>b.started-a.started):[]});}catch(e){res.status(500).json({error:e.message});}});
 app.get('/api/benchmark/report/:id',(req,res)=>{try{const dir=folder(req.params.id),summary=JSON.parse(fs.readFileSync(path.join(dir,'summary.json')));const events=fs.existsSync(path.join(dir,'events.ndjson'))?fs.readFileSync(path.join(dir,'events.ndjson'),'utf8').trim().split('\n').filter(Boolean).flatMap(s=>{try{return [JSON.parse(s)];}catch{return [{event:'incomplete_log_record',reason:'Interrupted log write'}];}}):[];res.set('Cache-Control','no-store');res.json(require('./report.cjs').enrich({summary,events}));}catch(e){res.status(404).json({error:e.message});}});
 let actionBusy=false;
 app.post('/api/benchmark/:action',express.json({limit:'32kb'}),async(req,res)=>{
 if(req.get('X-gSender-Benchmark')!=='1')return res.status(403).end();const b=req.body||{},action=req.params.action;
 try{
 if(action==='start')return res.json(await start(b.profile,b.device));
 if(!run||run.status!=='running'||b.id!==run.id)throw Error('Benchmark session has ended');
 if(action==='heartbeat'){lastBeat=Date.now();if(b.sample){log('native_sample',b.sample);if(Number.isFinite(b.sample.availableMiB)&&b.sample.availableMiB<256)await stop('stopped-memory','System available memory fell below 256 MiB');}return res.json({serverTime:Date.now(),status:run.status,current:run.current,job:run.job,progress:run.progress});}
 if(action==='log'){if(!Array.isArray(b.events)||b.events.length>30)throw Error('Invalid event batch');for(const e of b.events)log('ui',e);return res.json({ok:true});}
 if(action==='finish'){await stop(b.success===true?'completed':'failed',String(b.reason||'Suite finished').slice(0,240));return res.json(run);}
 if(action==='stop'){await stop();return res.json(run);}
 if(actionBusy)throw Error('Another benchmark action is pending');actionBusy=true;
 try{if(action==='load')return res.json(await load(b.fixture));if(action==='run'){if(!run.current)throw Error('Load a fixture first');log('start_requested',{id:run.current});controller().command('gcode:start');return res.json({ok:true});}if(action==='unload'){controller().workflow.stop();controller().sender.unload();controller().command('reset');engine.unload();worker.postMessage({type:'fixture',fixture:null});return res.json({ok:true});}throw Error('Unknown benchmark action');}finally{actionBusy=false;}
 }catch(e){res.status(409).json({error:e.message});}
 });
};
function recoverIfIdle(){if(!run)recover();}
