'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {io}=require('socket.io-client');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){for(let i=0;i<350;i++){const value=await fn();if(value)return value;await sleep(10);}throw Error('Timeout: '+label);}
test('packaged tablet pad: regular jog transition, standalone XY and automatic knob handover',{timeout:18000},async()=>{
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
  assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
 }catch(error){error.message+='\nPad status: '+JSON.stringify(await diagnose())+'\n'+logs.slice(-1000);throw error;}
 finally{socket?.close();if(child.exitCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
