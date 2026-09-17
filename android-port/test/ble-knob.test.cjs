'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {ClientAuth,CipherState,identity,proof,keys,SERVER,CLIENT}=require('../pendant/ble-crypto.cjs');
const {BlePort,pairing}=require('../pendant/ble-transport.cjs');
const {BleNetwork}=require('../runtime/ble-network.cjs');
const {decodeQr}=require('../pendant/qr-pairing.cjs');
const v=require('./ble-public-vectors.json'),hex=s=>Buffer.from(s,'hex');
const config={device:'wisecoco-'+v.identity,psk:hex(v.psk)};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Node wire bytes match independent Python vectors also verified by ESP C implementation',()=>{
 const auth=new ClientAuth(config,hex(v.client_nonce));assert.equal(auth.hello().toString('hex'),v.start);
 const {response,cipher}=auth.challenge(hex(v.challenge));assert.equal(response.toString('hex'),v.finish);
 assert.equal(keys(config.psk,identity(config.device),hex(v.client_nonce),hex(v.server_nonce)).toString('hex'),v.derived);
 assert.equal(cipher.encrypt(Buffer.from(v.client_line)).toString('hex'),v.client_packet_0);
 assert.equal(cipher.decrypt(hex(v.server_packet_0)).toString(),v.server_line);
 assert.equal(auth.key.every(n=>n===0),true);assert.equal(auth.nonce.every(n=>n===0),true);cipher.close();
 assert.equal(cipher.txKey.every(n=>n===0),true);assert.throws(()=>cipher.encrypt(Buffer.from(v.client_line)));
});
test('wrong key, identity, nonce or server proof cannot authenticate; reflected/replayed proofs rejected',()=>{
 for(const c of [{...config,psk:Buffer.alloc(32,9)},{...config,device:'wisecoco-000000000000'},config]){
  const a=new ClientAuth(c,c===config?Buffer.alloc(32,9):hex(v.client_nonce));assert.throws(()=>a.challenge(hex(v.challenge)),{code:'BLE_AUTH'});a.close();
 }
 for(const change of [b=>b[0]=3,b=>b[32]^=1,b=>b[64]^=1]){const a=new ClientAuth(config,hex(v.client_nonce)),packet=hex(v.challenge);change(packet);assert.throws(()=>a.challenge(packet));a.close();}
 const a=new ClientAuth(config,hex(v.client_nonce));a.challenge(hex(v.challenge)).cipher.close();assert.throws(()=>a.challenge(hex(v.challenge)));
});
test('GCM enforces exact direction, sequence, tag, ASCII single line, size and sequence exhaustion',()=>{
 for(const change of [b=>b[0]=0x10,b=>b[4]=1,b=>b[5]^=1,b=>b[b.length-1]^=1]){const c=new CipherState(hex(v.derived)),b=hex(v.server_packet_0);change(b);assert.throws(()=>c.decrypt(b));assert.equal(c.rx,0);c.close();}
 const c=new CipherState(hex(v.derived));c.decrypt(hex(v.server_packet_0));assert.throws(()=>c.decrypt(hex(v.server_packet_0)));
 for(const text of ['x\nx\n','x\r\n','x','\n','a'.repeat(192)+'\n','é\n'])assert.throws(()=>c.encrypt(Buffer.from(text)));
 c.tx=0xffffffff;assert.equal(c.encrypt(Buffer.from('x\n')).readUInt32BE(1),0xffffffff);assert.throws(()=>c.encrypt(Buffer.from('x\n')));c.close();
 const server=new CipherState(hex(v.derived),false),client=new CipherState(hex(v.derived));
 assert.equal(client.decrypt(server.encrypt(Buffer.from('a'.repeat(191)+'\n'))).length,192);server.close();client.close();
});
test('GSB1 is strict, bounded, BLE-only pairing; no address or credentials in status-like identity',()=>{
 const decoded=decodeQr(v.qr);assert.equal(decoded.transport,'ble');assert.equal(decoded.device,config.device);assert.equal(v.qr.length,98);
 const p=pairing(JSON.stringify(decoded));assert.deepEqual(p.psk,config.psk);
 for(const bad of [v.qr+'\n',v.qr.toLowerCase(),v.qr.replace('000.000.000.000','0.0.0.0'),v.qr.replace('000.000.000.000','192.168.001.080')])assert.throws(()=>decodeQr(bad));
 for(const change of [{host:'1.1.1.1'},{version:2},{transport:'wifi'},{psk:'0'.repeat(64)}])assert.throws(()=>pairing(JSON.stringify({...decoded,...change})));
});
function bridge(){let now=0;const sent=[],errors=[];const n=new BleNetwork(s=>sent.push(JSON.parse(s)),{now:()=>now});const c=n.connect(config.device);c.on('error',e=>errors.push(e));c.start();
 const receive=(state,fields={},age=0)=>n.receive({id:c.id,state,...fields},age);return {n,c,sent,errors,receive,time:t=>now=t};}
test('GATT bridge accepts negotiated MTU 517; current lease and a single write with exact ack',()=>{
 const f=bridge();f.receive('ready',{mtu:517});let done=0;f.c.write(Buffer.from([1]),e=>{assert.ifError(e);done++;});
 let second;f.c.write(Buffer.from([1]),e=>second=e);assert.ok(second);assert.equal(f.sent.filter(m=>m.op==='write').length,1);
 f.n.receive({id:f.c.id-1,state:'written',write:1});assert.equal(done,0);f.receive('written',{write:1});assert.equal(done,1);f.c.close();assert.equal(f.n.current,null);
});
test('GATT bridge rejects insufficient MTU, combined queue age, delayed ack and stale sequence',()=>{
 for(const mtu of [undefined,23,246]){const f=bridge();f.receive('ready',{mtu});assert.equal(f.c.closed,true);assert.equal(f.errors[0].hard,true);}
 for(const [native,jni] of [[50,0],[20,30],[0,50]]){const f=bridge();f.receive('ready',{mtu:247});f.receive('data',{ageMs:native,data:'AQ=='},jni);assert.equal(f.c.closed,true);}
 const f=bridge();f.receive('ready',{mtu:247});let failures=0;f.c.write(Buffer.from([1]),e=>{if(e)failures++;});f.time(100);f.receive('written',{write:1});assert.equal(f.c.closed,true);assert.equal(failures,1);
 const g=bridge();g.receive('ready',{mtu:247});g.receive('written',{write:42});assert.equal(g.errors[0].hard,true);
});
test('native foreground changes remain observable after a link closes',()=>{
 const f=bridge(),visible=[];f.n.setForegroundListener(x=>visible.push(x));f.c.close();f.n.receive({state:'foreground',visible:false});f.n.receive({state:'foreground',visible:true});assert.deepEqual(visible,[false,true]);
});
function peer({badProof=false,early=true}={}){
 let channel,server,clientNonce,serverNonce=hex(v.server_nonce),writes=[];
 const network={connect(){channel=new EventEmitter();channel.close=()=>{if(!channel.closed){channel.closed=true;channel.emit('close');}};
  channel.start=()=>queueMicrotask(()=>channel.emit('ready'));
  channel.write=(b,cb)=>{if(b[0]===1){clientNonce=Buffer.from(b.subarray(1));const tag=proof(config.psk,SERVER,identity(config.device),clientNonce,serverNonce);if(badProof)tag[0]^=1;
   const challenge=Buffer.concat([Buffer.from([2]),serverNonce,tag]);if(early){channel.emit('data',challenge);cb();}else{cb();channel.emit('data',challenge);}
  }else if(b[0]===3){assert.deepEqual(b.subarray(1),proof(config.psk,CLIENT,identity(config.device),clientNonce,serverNonce));server=new CipherState(keys(config.psk,identity(config.device),clientNonce,serverNonce),false);
   const packet=server.encrypt(Buffer.from(v.server_line));if(early){channel.emit('data',packet);cb();}else{cb();channel.emit('data',packet);}
  }else{writes.push(server.decrypt(b).toString());cb();}};return channel;}};
 const p=new BlePort(config,{network}),errors=[],data=[];p.on('error',e=>errors.push(e));p.on('data',b=>data.push(b.toString()));
 return {p,errors,data,writes,open:()=>new Promise(resolve=>p.open(resolve)),packet:line=>server.encrypt(Buffer.from(line)),send:b=>channel.emit('data',b),close:()=>{p.destroy();server?.close();}};
}
test('authenticated HELLO before/after write acknowledgment opens exactly once then encrypts STATE',async()=>{
 for(const early of [true,false]){const f=peer({early});assert.equal(await f.open(),undefined);assert.equal(f.p.isOpen,true);assert.deepEqual(f.data,[v.server_line]);
  let called=0;f.p.write(Buffer.from(v.client_line),e=>{assert.ifError(e);called++;});assert.equal(called,1);assert.deepEqual(f.writes,[v.client_line]);f.close();}
});
test('wrong proof and replay fail hard, close and erase keys; cannot restore armed intent',async()=>{
 const bad=peer({badProof:true});assert.ok(await bad.open());assert.equal(bad.errors[0].hard,true);assert.equal(bad.p.isOpen,false);assert.deepEqual(bad.data,[]);bad.close();
 const f=peer();await f.open();const packet=f.packet('P2 ALIVE example\n');f.send(packet);const before=f.data.length;f.send(packet);assert.equal(f.data.length,before);assert.equal(f.errors[0].hard,true);assert.equal(f.p.destroyed,true);assert.equal(f.p.cipher.rxKey.every(b=>b===0),true);f.close();
});
test('malformed outgoing command reports a hard fault before the failed write callback',async()=>{
 const f=peer();await f.open();const order=[];f.p.on('error',e=>order.push('error:'+e.hard));f.p.write(Buffer.from('G0 X1\n'),()=>order.push('callback'));assert.deepEqual(order,['error:true','callback']);f.close();
});
test('bounded setup/authentication/HELLO and stalled writes all release the channel',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const f=bridge();t.mock.timers.tick(15000);assert.equal(f.c.closed,true);
 const g=bridge();g.receive('ready',{mtu:247});let failed=0;g.c.write(Buffer.from([1]),e=>failed+=!!e);t.mock.timers.tick(100);assert.equal(g.c.closed,true);assert.equal(failed,1);
 for(const phase of ['challenge','hello']){
  const c=new EventEmitter();c.start=()=>c.emit('ready');c.close=()=>{c.closed=true;};
  c.write=(packet,cb)=>{cb();if(phase==='hello'&&packet[0]===1){
   const nonce=hex(v.server_nonce);c.emit('data',Buffer.concat([Buffer.from([2]),nonce,proof(config.psk,SERVER,identity(config.device),packet.subarray(1),nonce)]));}};
  const p=new BlePort(config,{network:{connect:()=>c}});let error;p.on('error',()=>{});p.open(e=>error=e);t.mock.timers.tick(phase==='challenge'?5000:8000);
  assert.ok(error);assert.equal(error.hard,false,'silence is retryable, unlike invalid authentication');assert.equal(error.code,phase==='challenge'?'BLE_TIMEOUT':'BLE_LINK');assert.equal(c.closed,true);assert.equal(p.isOpen,false);assert.equal(p.auth.key.every(b=>b===0),true);
 }
});
