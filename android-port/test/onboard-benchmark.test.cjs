const {test}=require('node:test');const assert=require('node:assert/strict');const {EventEmitter}=require('node:events');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');const {execFileSync,fork}=require('node:child_process');const {io}=require('socket.io-client');
const {Simulator,canonical}=require('../benchmark/simulator.cjs');const gate=require('../benchmark/gate.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('benchmark gate accounts for pending physical opens and only permits exact loopback endpoint',()=>{
 const pending=new EventEmitter();gate.enter(pending,{path:'android-usb:1:0'});assert.throws(()=>gate.acquire(),/Disconnect/);pending.emit('close');gate.acquire();
 for(const o of [{path:'android-usb:1:0'},{network:true,path:'192.168.5.1',ethernetPort:3333},{network:true,path:'127.0.0.1',ethernetPort:3333}])assert.throws(()=>gate.check(o),/disabled/);
 gate.state.port=3333;assert.doesNotThrow(()=>gate.check({network:true,path:'127.0.0.1',ethernetPort:3333}));assert.throws(()=>gate.check({network:true,path:'127.0.0.1',ethernetPort:23}));gate.finish();
});
test('simulator verifies fragmented stream, paced ACKs and canonical checksum',()=>{
 let now=0;const events=[],responses=[];const commands=['G4P0.123','G1X1Y2Z-3','M2'];const sha=require('node:crypto').createHash('sha256').update(commands.join('\n')+'\n').digest('hex');
 const sim=new Simulator({send:s=>responses.push(s),emit:(event,data)=>events.push({event,...data}),now:()=>now});sim.expected={commands:3,command_sha256:sha};
 sim.accept(Buffer.from('G4P0.'));sim.accept(Buffer.from('123\nG1 X1 Y2 Z-3 (comment)\nM2\n'));assert.equal(sim.acked,0);now=2;sim.tick();assert.equal(sim.acked,1);now=6;sim.tick();
 assert.equal(events.find(e=>e.event==='job_completed').expectedMatch,true);assert.equal(canonical('G1 X2 (ok);xx'),'G1X2');assert.equal(responses.filter(x=>x==='ok\n').length,3);
});
test('simulator detects RX overflow and cancellation discards queued commands',()=>{const events=[];const sim=new Simulator({send(){},emit:(e)=>events.push(e)});sim.accept(Buffer.from('G4P0.123\n'+('G1X123456789\n'.repeat(200))));assert.ok(events.includes('rx_overflow'));sim.accept(Buffer.from([0x18]));assert.equal(sim.running,false);assert.equal(sim.bytes,0);assert.equal(sim.queue.length,0);});
test('packaged onboard suite: no USB opens, exact stream, durable report and restart after cancel', {timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-onboard-'));execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),path.join(dir,'runtime')]);fs.copyFileSync(path.join(__dirname,'fake-native-autoconnect.cjs'),path.join(dir,'fake.cjs'));
 const child=fork(path.join(dir,'runtime/bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'fake.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});let logs='',socket;
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 const ipc=(test,extra={})=>new Promise(resolve=>{const id=Math.random();const got=m=>{if(m.id===id){child.off('message',got);resolve(m);}};child.on('message',got);child.send({id,test,...extra});});
 try{
  const ready=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(logs)),10000);child.on('message',m=>{if(m.host==='ready'){clearTimeout(t);resolve(m);}});});
  const base='http://127.0.0.1:'+ready.port;const page=await fetch(base,{headers:{'X-gSender-Key':ready.token}});const cookie=page.headers.get('set-cookie').split(';')[0];
  const api=async(action,body)=>{const r=await fetch(base+'/api/benchmark'+(action?'/'+action:''),{method:body?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json','X-gSender-Benchmark':'1'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
  socket=io(base,{transports:['websocket'],auth:{androidDisplayBatch:1},extraHeaders:{Cookie:cookie},reconnection:false});
  let consoleBatches=0;socket.on('android:serial-batch',lines=>{assert.ok(lines.length<=128);consoleBatches++;});await new Promise(r=>socket.on('connect',r));
  const session=await api('start',{profile:'full',device:{model:'test'}}),id=session.id;
  await assert.rejects(api('start',{profile:'quick'}),/already active/);
  const open=(port,options)=>new Promise((resolve,reject)=>socket.timeout(10000).emit('open',port,options,(timeout,err)=>timeout||err?reject(Error(String(timeout||err))):resolve()));
  await assert.rejects(open('android-usb:10:0',{baudrate:115200}),/disabled/);await assert.rejects(open('127.0.0.1',{network:true,ethernetPort:23,baudrate:115200}),/disabled/);
  await ipc('devices',{devices:[{path:'android-usb:10:0',vendorId:'0483',productId:'5740',usbPermission:true}]});await delay(1200);assert.equal((await ipc('stats')).opens.length,0);
  await open('127.0.0.1',{network:true,ethernetPort:session.port,baudrate:115200,defaultFirmware:'GrblHAL'});await delay(1500);
  await api('load',{id,fixture:'contour'});await api('run',{id});let status;
  for(let i=0;i<30;i++){await delay(500);status=await api('heartbeat',{id});if(status.job?.event==='job_completed')break;}
  assert.equal(status.job?.expectedMatch,true,JSON.stringify(status)+'\n'+logs);
  assert.ok(consoleBatches>0 && consoleBatches<500, 'Negotiated client receives bounded console batches');
  await api('unload',{id});await delay(2000);
  await api('load',{id,fixture:'relief-5m'});await api('run',{id});await delay(1000);await api('unload',{id});await delay(2000);
  await api('load',{id,fixture:'contour'});await api('run',{id});
  for(let i=0;i<30;i++){await delay(500);status=await api('heartbeat',{id});if(status.job?.event==='job_completed')break;}
  assert.equal(status.job?.expectedMatch,true,'A partial streaming case must not corrupt the next job');
  await api('log',{id,events:[{event:'viewport',zoomFactor:2}]});await api('finish',{id,success:true});
  const report=await api('report/'+id);assert.equal(report.summary.status,'completed');assert.equal(report.summary.cases[0].expectedMatch,true);assert.ok(report.events.some(e=>e.zoomFactor===2));
  await ipc('devices',{devices:[]});const second=await api('start',{profile:'quick'});await api('stop',{id:second.id});assert.equal((await api('report/'+second.id)).summary.status,'cancelled');
  await assert.rejects(api('run',{id:second.id}),/ended/);
  const third=await api('start',{profile:'quick'});const low=await api('heartbeat',{id:third.id,sample:{availableMiB:200}});assert.equal(low.status,'stopped-memory');
  const record=path.join(dir,'data/benchmarks',id,'events.ndjson');fs.appendFileSync(record,'{partial');assert.ok((await api('report/'+id)).events.some(e=>e.event==='incomplete_log_record'));
  const unauth=await fetch(base+'/api/benchmark');assert.equal(unauth.status,403);
  const csrf=await fetch(base+'/api/benchmark/start',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({profile:'quick'})});assert.equal(csrf.status,403);
 }catch(e){e.message+='\n'+logs.slice(-10000);throw e;}finally{socket?.close();child.kill();await new Promise(resolve=>child.once('exit',resolve));fs.rmSync(dir,{recursive:true,force:true});}
});

test('all packaged fixtures match their declared sizes and hashes',()=>{const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');for(const f of require('../benchmark/fixtures/manifest.json')){const data=gunzipSync(fs.readFileSync(path.join(__dirname,'../benchmark/fixtures',f.file+'.gz')));assert.equal(data.length,f.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);}});
test('runner loads the first file before looking for its initially absent visualizer',async()=>{
 const {runSuite}=await import('../ui/benchmark-runner.mjs');const events=[],calls=[];let svg,job;
 global.document={querySelectorAll:()=>svg?[svg]:[]};global.__gsenderBenchmarkReadUI=()=>({workflow:'idle'});
 try{await runSuite({session:{fixtures:[{id:'test',full:true,label:'test',commands:1}]},api:async action=>{calls.push(action);if(action==='load')svg={__gsenderViewport:{},dataset:{benchmarkLoad:'new',previewStatus:'ready'}};if(action==='run')job={event:'job_completed',expectedMatch:true,overflows:0,time:Date.now()};},state:()=>({job}),update(){},log:e=>events.push(e),check(){},exercise:async()=>{assert.ok(svg);}});
 assert.deepEqual(calls,['load','run','unload']);assert.ok(events.some(e=>e.event==='load_ready'));assert.ok(events.some(e=>e.event==='verified_stream'));}finally{delete global.document;delete global.__gsenderBenchmarkReadUI;}
});

test('reports distinguish post-stream UI animation from actual streaming and record observed idle delay',()=>{
 const {enrich}=require('../benchmark/report.cjs');const result=enrich({summary:{fixtures:[{id:'arcs'}]},events:[{event:'job_started',case:'arcs',time:100},{event:'job_completed',case:'arcs',time:200},{event:'workflow_changed',workflow:'idle',time:350},{event:'viewport',label:'arcs:stream:0',startedAt:150,endedAt:250},{event:'viewport',label:'arcs:stream:1',startedAt:260,endedAt:300}]});
 assert.equal(result.measurements[0].completionDisplayDelayMs,150);assert.equal(result.measurements[0].viewports[0].actualStreamingOverlapMs,50);assert.equal(result.measurements[0].viewports[0].classification,'mixed');assert.equal(result.measurements[0].viewports[1].classification,'not-streaming');
});
