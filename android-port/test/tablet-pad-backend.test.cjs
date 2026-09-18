'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {io}=require('socket.io-client');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<350;i++){const value=await fn();if(value)return value;await sleep(10);}throw Error('Timeout: '+label);}
test('packaged tablet pad: regular jog, XY, knob handover and tilt sensor stream',{timeout:23000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tablet-pad-backend-')),runtime=path.join(dir,'runtime');
 if(process.env.TEST_TABLET_APK){
  execFileSync('python3',['-c','import sys,zipfile,io; a=zipfile.ZipFile(sys.argv[1]); zipfile.ZipFile(io.BytesIO(a.read("assets/payload.zip"))).extractall(sys.argv[2])',process.env.TEST_TABLET_APK,runtime]);
 }else execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),runtime]);
 fs.copyFileSync(path.join(__dirname,'pendant-native.cjs'),path.join(dir,'native.cjs'));
 const child=fork(path.join(runtime,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'native.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});
 const messages=[];let socket,logs='',diagnose=async()=>({});child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 try{
  const ready=await until(()=>messages.find(m=>m.host==='ready'),'backend startup'),base='http://127.0.0.1:'+ready.port;
  const headers={'x-gsender-key':ready.token,'X-USB-Pendant':'1','Content-Type':'application/json'};
  const status=async()=> (await fetch(base+'/api/tablet-pad',{headers})).json();diagnose=status;
  const post=async(action,body,ok=true)=>{const r=await fetch(base+'/api/tablet-pad/'+action,{method:'POST',headers,body:JSON.stringify(body)}),s=await r.json();assert.equal(r.ok,ok,JSON.stringify(s));return s;};
  const before=await status();assert.equal(before.ready,false);
  socket=io(base,{transports:['websocket'],extraHeaders:headers,reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  await new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
  await until(async()=>{const s=await status();return s.ready&&s.cnc.state==='IDLE'&&s.cnc.transportEmpty;},'pad becomes ready on idle USB CNC');
  let writeStart=0;
  const writes=()=>messages.slice(writeStart).filter(m=>m.test==='cnc-write'&&m.data.includes('$J='));
  const cancels=()=>messages.filter(m=>m.test==='cnc-write'&&m.hex==='85').length;
  assert.equal(writes().length,0,'polling must not move');
  // Reproduce the normal button-to-pad transition against the actual dev streamer.
  child.send({test:'allow-stream',value:true});await until(()=>messages.some(m=>m.test==='stream-enabled'),'stream emulator');
  socket.emit('command','android-usb:42:0','gcode',['$J=G21 G91 X0.5 Y-0.5 F1000']);
  await until(()=>writes().length===1,'one Precise rim step');
  await sleep(80);assert.equal(writes().length,1,'a finite step cannot repeat itself');
  assert.match(writes()[0].data,/X0\.5\s*Y-0\.5\s*F1000/);
  await until(async()=> (await status()).ready,'pad ready after Precise step');writeStart=messages.length;
  socket.emit('command','android-usb:42:0','jog:start',{X:1,Y:1},1000,'mm');
  await until(()=>writes().length>=4,'regular jog stream');
  socket.emit('command','android-usb:42:0','jog:stop');
  await until(async()=> (await status()).ready,'pad ready after regular jog');
  child.send({test:'allow-stream',value:false});await sleep(30);writeStart=messages.length;
  let lease=await post('begin',{visible:true,rapid:1000});
  lease=await post('move',{...lease,x:0,y:0});assert.equal(writes().length,0,'touching center must not move');
  // Hold simulated position at the first point so it cannot reclaim unbounded planner travel.
  child.send({test:'hold-cnc',value:true});
  lease=await post('move',{...lease,x:.7,y:.4});
  await until(()=>writes().length>0,'finite diagonal jog');
  assert.match(writes()[0].data,/^\$J=G21G91 X\d+\.\d+ Y\d+\.\d+ F\d+\.\d+/);
  const beforeRelease=cancels();
  await post('end',{token:lease.token});await until(()=>cancels()>beforeRelease,'release cancellation');
  const count=writes().length;await sleep(250);assert.equal(writes().length,count,'release cannot replay input');
  await post('move',{...lease,x:1,y:0},false);
  assert.equal(messages.some(m=>m.test==='opened'&&m.path==='android-usb:55:0'),false,'tablet pad must not require physical knob');
  // Keep real queued motion outstanding until cancellation. The default mock
  // teleports to every endpoint/Idle, where no cancellation would be needed.
  const holdMarker=messages.length;child.send({test:'hold-cnc',value:true});
  await until(()=>messages.slice(holdMarker).some(m=>m.test==='cnc-hold'&&m.value),'hold simulated motion for stall test');
  await until(async()=> (await status()).ready,'ready after release');
  lease=await post('begin',{visible:true,rapid:1000});
  lease=await post('move',{...lease,x:.7,y:0});
  const beforeStall=cancels();
  await sleep(320);await until(()=>cancels()>beforeStall,'input stall cancels the queued movement');
  assert.equal((await status()).active,true,'a short stall keeps the finger contact');
  const stalledWrites=writes().length;
  lease=await post('move',{...lease,x:-.7,y:0});
  assert.equal(lease.resync,true);assert.equal(writes().length,stalledWrites,'late direction must not move');
  for(let i=0;i<5;i++){lease=await post('move',{...lease,x:0,y:.7});await sleep(40);}
  assert.ok(writes().length>stalledWrites,'fresh input resumes after the cancellation barrier');
  for(const write of writes().slice(stalledWrites))assert.match(write.data,/^\$J=G21G91 Y/,'only the fresh direction moves');
  await post('end',{token:lease.token});
  await until(async()=> (await status()).ready,'ready after recovery release');
  // The visible Android UI also maintains an automatically armed physical knob.
  // Its acknowledgement of READY must not revoke the tablet's new contact.
  const knob=async(action,body)=>{const r=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers,body:JSON.stringify(body)});const value=await r.json();assert.equal(r.ok,true,JSON.stringify(value));return value;};
  const knobStatus=async()=> (await fetch(base+'/api/usb-pendant',{headers})).json();
  const presence={automatic:true,visible:true,session:'a'.repeat(32),preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:2000}};
  child.send({test:'hold-cnc',value:false});child.send({test:'automatic-input'});
  await knob('heartbeat',presence);await knob('connect',{automatic:true});
  await until(async()=>{await knob('heartbeat',presence);return (await knobStatus()).armed;},'automatic knob ready');
  await until(async()=> (await status()).ready,'tablet ready with knob enabled');
  lease=await post('begin',{visible:true,rapid:1000});
  for(let i=0;i<12;i++){
   lease=await post('move',{...lease,x:0,y:0});await knob('heartbeat',presence);await sleep(40);
   assert.equal((await status()).active,true,'knob disable acknowledgement cannot end tablet contact');
   assert.equal((await knobStatus()).armed,false,'knob cannot reclaim active tablet contact');
  }
  const beforeTablet=writes().length;
  lease=await post('move',{...lease,x:.7,y:.4});await until(()=>writes().length>beforeTablet,'XY movement after knob handover');
  await post('end',{token:lease.token});
  const afterTablet=writes().length;
  await until(async()=>{await knob('heartbeat',presence);return (await knobStatus()).armed;},'neutral knob ready after tablet release');
  assert.equal(writes().length,afterTablet,'knob rearming cannot replay tablet motion');
  // Drive the new sensor controller through the same packaged backend and
  // bounded USB path, including physical-knob exclusion and input loss.
  const {TiltSession}=require('../ui/tilt-session.cjs');
  const tilt=new TiltSession({post,now:()=>performance.now()});
  tilt.setFeed(600);tilt.enable();let sensorSeq=0;
  const sensor=async(degrees,count=1,valid=true)=>{
   for(let i=0;i<count;i++){
    const a=degrees*Math.PI/180;
    tilt.tick({active:true,valid,ageMs:valid?0:200,seq:++sensorSeq,rotation:0,x:-9.81*Math.sin(a),y:0,z:9.81*Math.cos(a)});
    await knob('heartbeat',presence);await sleep(40);
   }
  };
  const beforeTilt=writes().length;
  await sensor(20,14);assert.equal(writes().length,beforeTilt,'enable while tilted cannot move');
  await until(async()=>{await sensor(0);return tilt.lease;},'flat neutral tilt session');
  assert.equal(writes().length,beforeTilt,'flat is zero speed');
  await sensor(25,14);assert.ok(writes().length>beforeTilt,'fresh tilt streams movement');
  for(const write of writes().slice(beforeTilt)){
   assert.match(write.data,/^\$J=G21G91 X[0-9.]+ F[0-9.]+/);
   assert.ok(Number(/F([0-9.]+)/.exec(write.data)[1])<=600.001,'selected preset caps tilt speed');
  }
  assert.equal((await knobStatus()).armed,false,'physical knob cannot take over tilt');
  await sensor(25,1,false);const afterLoss=writes().length;
  await sensor(25,10);assert.equal(writes().length,afterLoss,'held tilt cannot restart after sensor loss');
  // Z can move while tilt is still waiting for neutral, with X/Y blocked.
  tilt.setZHold(1);const beforeZ=writes().length;await sensor(20,8);
  assert.ok(writes().length>beforeZ);for(const w of writes().slice(beforeZ))assert.match(w.data,/^\$J=G21G91 Z/);
  tilt.setZHold(0);await sensor(20,6);
  await sensor(0,14);await sensor(15,5);
  const beforeCombined=writes().length;tilt.setZHold(-1);await sensor(15,10);
  assert.ok(writes().slice(beforeCombined).some(w=>/X[0-9.]+ Z-[0-9.]+/.test(w.data)),'same finite command must carry X and Z');
  assert.equal(tilt.enabled,true);assert.equal(tilt.calibrated,true);
  tilt.setZHold(0);await sensor(15,8);
  const afterZRelease=writes().length;await sensor(15,5);
  assert.ok(writes().length>afterZRelease,'tilt continues after Z release without recalibration');
  for(const w of writes().slice(afterZRelease))assert.doesNotMatch(w.data,/ Z/);
  const stepAt=writes().length;tilt.stepZ(.1);await sensor(15,12);
  const zDistance=writes().slice(stepAt).reduce((n,w)=>n+Number(/Z(-?[0-9.]+)/.exec(w.data)?.[1]||0),0);
  assert.ok(Math.abs(zDistance-.1)<1e-6,'Z tap moves exactly the selected distance while X continues');
  tilt.disable();await sleep(50);
  // Reproduce the photographed null event: unplug during delayed startup.
  const close=()=>new Promise((resolve,reject)=>socket.timeout(3000).emit('close','android-usb:42:0',(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
  const open=()=>new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
  await close();const reconnectAt=messages.length;await open();
  await until(()=>messages.slice(reconnectAt).some(m=>m.test==='cnc-write'&&m.data.includes('$$')),'delayed controller initialization');
  await close();await sleep(150);
  assert.deepEqual(messages.filter(m=>m.host==='error'),[],'disconnect during initialization must not stop the backend');
  await open();await until(async()=> (await status()).ready,'reconnect after interrupted initialization');
  assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
 }catch(error){error.message+='\nPad status: '+JSON.stringify(await diagnose())+'\nBackend errors: '+JSON.stringify(messages.filter(m=>m.host==='error'))+'\n'+logs.slice(-1000);throw error;}
 finally{socket?.close();if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
