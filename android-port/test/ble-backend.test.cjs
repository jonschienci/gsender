'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fork,execFileSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {io}=require('socket.io-client');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<800;i++){const value=await fn();if(value)return value;await sleep(10);}throw Error('Timeout: '+label);}
for(const automatic of [false,true])test((automatic?'automatic INPUT: ':'legacy: ')+'packaged BLE backend: QR auto-connect, authenticated finite USB CNC jog, neutral rearm, replay/background rejection', {timeout:40000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gsender-ble-payload-')),payload=path.join(dir,'runtime');
 execFileSync('python3',['-m','zipfile','-e',path.resolve(__dirname,'../app/src/main/assets/payload.zip'),payload]);
 for(const n of ['pendant-native.cjs','ble-backend-native.cjs'])fs.copyFileSync(path.join(__dirname,n),path.join(dir,n));
 fs.copyFileSync(path.join(__dirname,'../pendant/ble-crypto.cjs'),path.join(dir,'ble-crypto.cjs'));
 const child=fork(path.join(payload,'bootstrap.cjs'),[],{execArgv:['--no-global-search-paths','--require',path.join(dir,'ble-backend-native.cjs')],env:{...process.env,NODE_PATH:''},stdio:['ignore','pipe','pipe','ipc']});
 const messages=[];let logs='',socket,heartbeat;child.on('message',m=>messages.push(m));child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 try{
  const ready=await until(()=>messages.find(m=>m.host==='ready'),'backend boot'),base='http://127.0.0.1:'+ready.port,key={'x-gsender-key':ready.token};
  const status=async()=> (await fetch(base+'/api/usb-pendant',{headers:key})).json();
  const post=async(action,body={})=>{const r=await fetch(base+'/api/usb-pendant/'+action,{method:'POST',headers:{...key,'X-USB-Pendant':'1','Content-Type':'application/json'},body:JSON.stringify(body)}),s=await r.json();assert.equal(r.ok,true,JSON.stringify(s));return s;};
  const body={session:'a'.repeat(32),automatic,visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000}};
  await post('heartbeat',body);heartbeat=setInterval(()=>post('heartbeat',body).catch(()=>{}),300);
  const token=(await post('scan-begin')).token;
  await post('scan-commit',{token,qr:'GSB1:A1B2C3D4E5F6:000.000.000.000:'+'34'.repeat(32)});
  await until(async()=> (await status()).ready,'QR authenticated connection');
  assert.equal((await status()).transport,'ble');assert.equal((await status()).armed,false);
  assert.equal(messages.some(m=>m.test==='opened'),false,'QR cannot open the CNC or USB knob');
  socket=io(base,{transports:['websocket'],extraHeaders:key,reconnection:false});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);});
  await new Promise((resolve,reject)=>socket.timeout(3000).emit('open','android-usb:42:0',{baudrate:115200,defaultFirmware:'GrblHAL'},(timeout,err)=>timeout||err?reject(timeout||err):resolve()));
  await until(async()=>{const s=await status();return s.ready&&s.controlsReleased&&s.cnc.valid;},'CNC and released knob');
  if(automatic)await until(async()=> (await status()).armed,'automatic ready');else await post('arm',body);await until(()=>messages.filter(m=>m.test==='ble-state'&&m.armed==='1').length>=(automatic?2:1),'fresh armed ticket after context baseline');
  child.send({test:automatic?'ble-input':'ble-detent'});const jogs=()=>messages.filter(m=>m.test==='cnc-write'&&m.data.includes('$J='));
  await until(()=>jogs().length===1,'one finite USB CNC jog');await sleep(200);
  if(automatic){
   child.send({test:'ble-silence'});child.send({test:'ble-reboot'});
   await until(async()=>{const s=await status();return s.reconnecting&&!s.armed;},'authenticated boot change pauses movement');
   await until(async()=> /authentication timed out/i.test((await status()).lastConnectionIssue||''),'missing authentication challenge retries after timeout');
   assert.equal((await status()).armed,false);child.send({test:'ble-poweron'});
  }else child.send({test:'ble-lost'});await until(async()=>{const s=await status();return (automatic?s.reconnecting:s.armRequested)&&!s.armed;},'pause during loss');
  await until(async()=> (await status()).armed && messages.some(m=>m.test==='ble-state'&&m.generation>=2),'neutral-gated reconnect');
  assert.equal(jogs().length,1,'no replay on rearm');
  const authenticated=messages.filter(m=>m.test==='ble-auth');
  assert.ok(authenticated.length>=2);assert.equal(new Set(authenticated.map(m=>m.nonce)).size,authenticated.length,'every reconnect uses new cryptographic material');
  const sessions=messages.filter(m=>m.test==='ble-state');assert.notEqual(sessions[0].session,sessions.at(-1).session,'P2 session is replaced');
  child.send({test:'ble-replay'});await until(async()=> !(await status()).connected,'ciphertext replay rejection');
  assert.equal((await status()).armRequested,false);assert.equal((await status()).reconnecting,false);
  await post('connect');await until(async()=> (await status()).ready,'fresh manual authenticated connection');
  assert.equal((await status()).armed,false);
  await until(async()=> (await status()).controlsReleased,'released');if(automatic)await until(async()=> (await status()).armed,'automatic ready again');else await post('arm',body);
  child.send({test:'ble-background'});await until(async()=> !(await status()).connected,'native background closure');
  assert.equal((await status()).armRequested,false);await sleep(600);assert.equal((await status()).connected,false);
  assert.equal(jogs().length,1);assert.equal(messages.filter(m=>m.test==='opened'&&m.path==='android-usb:42:0').length,1);
  assert.equal(messages.some(m=>m.test==='opened'&&m.path==='android-usb:55:0'),false);
  assert.deepEqual(messages.filter(m=>m.host==='error'),[]);
  assert.equal((JSON.stringify(messages)+JSON.stringify(await status())+logs).includes('34'.repeat(32)),false);
 }finally{clearInterval(heartbeat);socket?.close();if(child.exitCode===null)await new Promise(r=>{child.once('exit',r);child.kill();});fs.rmSync(dir,{recursive:true,force:true});}
});
