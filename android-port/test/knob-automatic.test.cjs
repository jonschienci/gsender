'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Pendant}=require('../pendant/service.cjs');
const {BleNetwork}=require('../runtime/ble-network.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const boot='0123456789abcdef';
function fixture(transport='ble'){
 let now=0,offline=false;const ports=[],writes=[],commands=[];
 const raw={isOpen:true,writableLength:0,writableCorked:false,writeBounded(){}};
 const cnc={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{'$13':'0','$110':'2000','$111':'2000','$112':'1000','$120':'100','$121':'100','$122':'100'}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},connection:new EventEmitter(),runner:new EventEmitter(),
  isOpen:()=>true,command(cmd,...args){commands.push([cmd,...args]);},writeln(line){writes.push(line);}};
 cnc.connection.connection={port:raw};cnc.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 class Port extends EventEmitter{
  static async list(){return [{path:'android-usb:1:0',vendorId:'303a',productId:'1001'}];}
  constructor(config){super();this.path=config.path||transport+':'+config.device;this.writes=[];this.seq=0;this.context=0;this.key=null;this.plus=0;this.minus=0;ports.push(this);}
  open(cb){if(offline){const e=Object.assign(Error('BLE unavailable'),{code:'BLE_LINK'});this.emit('error',e);cb(e);return;}this.isOpen=true;cb();}
  write(bytes,cb){this.writes.push(bytes.toString());cb();}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.isOpen=false;this.emit('close');}
 }
 const network=new BleNetwork(()=>{});
 const s=new Pendant({bleNetwork:network,SerialPort:Port,getControllers:()=>({cnc}),BleTransport:Port,now:()=>now});
 s.setTransport(transport);
 if(transport==='ble')s.configurePairing(JSON.stringify({version:1,device:'wisecoco-123456abcdef',transport:'ble',psk:'a7'.repeat(32)}));
 const body={session:'a'.repeat(32),automatic:true,visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000}};
 const status=()=>cnc.runner.emit('status',cnc.runner.state.status);
 function receive(p,line){p.emit('data',Buffer.from(line+'\n'));}
 function echo(p,{neutral=1,selection=0,page=0,epoch=1,step=500,count=0,direction=0,period=0,age=0,ready=1,legacy=false}={}){
  const g=s.gate;if(!g)return;const state=p.writes.at(-1)?.trim().split(' ');if(!state)return;
  if(legacy){receive(p,`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`);return;}
  const ticket=Number(state[3]),key=JSON.stringify([state[5],selection,page,epoch,step,state[9]]);
  if(p.key!==key){p.key=key;p.context++;p.plus=p.minus=0;count=direction=0;}
  if(direction>0)p.plus+=count;if(direction<0)p.minus+=count;
  receive(p,`P2 INPUT ${g.boot} ${g.session} ${++p.seq} ${ticket} ${p.context} ${ready} 0 ${selection} ${step} ${page} ${epoch} ${neutral} ${p.plus} ${p.minus} ${direction} ${period} ${age}`);
 }
 async function cycle(opts={},p=ports.at(-1)){
  now+=40;s.ui(body);status();s.tick();echo(p,opts);await turn();
 }
 async function open(){s.ui(body);await s.connect();const p=ports.at(-1);receive(p,`P2 HELLO ${boot} 2 1 0`);s.tick();status();return p;}
 async function ready(){const p=await open();for(let i=0;i<13;i++)await cycle();assert.equal(s.armed,true,s.reason);return p;}
 return {s,network,cnc,raw,body,ports,writes,commands,open,ready,cycle,echo,receive,status,offline:b=>offline=b,time:n=>now=n,now:()=>now};
}
for(const transport of ['usb','ble']){
 test(transport+': connected knob enables only after fresh neutral, then stays ready across own enable context',async()=>{
  const f=fixture(transport);await f.open();
  for(let i=0;i<8;i++)await f.cycle({neutral:0});assert.equal(f.s.armed,false);
  for(let i=0;i<6;i++)await f.cycle();assert.equal(f.s.armed,false);
  for(let i=0;i<6;i++)await f.cycle();assert.equal(f.s.armed,true,f.s.reason);
  const context=f.s.gate.inputContext;
  for(let i=0;i<30;i++)await f.cycle();
  assert.equal(f.s.armed,true);assert.equal(f.s.gate.inputContext,context);assert.equal(f.s.mode,'adaptive');assert.equal(f.writes.length,0);f.s.disconnect();
 });
 test(transport+': new turn bursts jog immediately in adaptive mode; repeats cannot prolong finite motion',async()=>{
  const f=fixture(transport);await f.ready();
  await f.cycle({neutral:0,count:8,direction:1,period:4});
  assert.equal(f.s.machine.adaptive.phase,'fast');assert.equal(f.writes.length,1);assert.match(f.writes[0],/^\$J=G21G91 X/);
  for(let age=40;age<=200;age+=40)await f.cycle({neutral:0,direction:1,period:4,age});
  assert.equal(f.commands.filter(c=>c[0]==='jog:stop').length,1);assert.equal(f.writes.length,1);f.s.disconnect();
 });
 test(transport+': controls/settings/owner changes pause and require a new release interval',async()=>{
  for(const change of [
   f=>{f.cnc.settings.settings.$110='1500';},f=>{f.cnc.connection.connection.port={...f.raw};},
   f=>{f.s.setMode('step');},f=>{f.body.session='b'.repeat(32);},
   f=>{f.body.preset={...f.body.preset,feedrate:500};},f=>{f.cnc.command('jog:start','X',1);}
  ]){
   const f=fixture(transport);await f.ready();change(f);await f.cycle();assert.equal(f.s.armed,false,f.s.reason);
   for(let i=0;i<5;i++)await f.cycle();assert.equal(f.s.armed,false);
   for(let i=0;i<8;i++)await f.cycle();assert.equal(f.s.armed,true,f.s.reason);assert.equal(f.writes.length,0);f.s.disconnect();
  }
 });
 test(transport+': external running job, absent limits, held STEP/page or old firmware cannot auto-enable',async()=>{
  for(const variant of ['job','limits','step','page','legacy']){
   const f=fixture(transport);await f.open();
   if(variant==='job')f.cnc.workflow.state='running';if(variant==='limits')delete f.cnc.settings.settings.$120;
   for(let i=0;i<30;i++)await f.cycle(variant==='step'?{selection:3}:variant==='page'?{page:2}:variant==='legacy'?{legacy:true}:{});
   assert.equal(f.s.armed,false,variant);assert.equal(f.writes.length,0);f.s.disconnect();
  }
 });
 test(transport+': CNC polling writes block enabling only while queued and do not erase release evidence',async()=>{
  const f=fixture(transport);await f.open();
  for(let i=0;i<15;i++){f.raw.writableLength=1;await f.cycle();f.raw.writableLength=0;f.s.tick();}
  assert.equal(f.s.armed,true,f.s.reason);f.s.disconnect();
 });
 test(transport+': page/axis change and background immediately pause; queued pre-change input never resumes',async()=>{
  const f=fixture(transport);await f.ready();await f.cycle({selection:1});assert.equal(f.s.armed,false);
  for(let i=0;i<5;i++)await f.cycle({selection:1,neutral:0,count:1,direction:1,period:40});
  assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
  for(let i=0;i<14;i++)await f.cycle({selection:1});assert.equal(f.s.armed,true);assert.equal(f.writes.length,0);
  f.s.ui({...f.body,visible:false});assert.equal(f.s.armed,false);
  f.s.disconnect();
 });
}
test('wireless loss cancels; fresh new-session neutral proof restores readiness without replay',async()=>{
 const f=fixture();const p=await f.ready();const old=f.s.gate.session;
 await f.cycle({neutral:0,count:8,direction:1,period:4});p.destroy();assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);
 f.time(f.now()+500);f.s.ui(f.body);f.status();f.s.tick();await turn();
 const next=f.ports.at(-1);f.receive(next,`P2 HELLO ${boot} 2 1 0`);f.s.tick();f.status();assert.notEqual(f.s.gate.session,old);
 for(let i=0;i<15;i++)await f.cycle();assert.equal(f.s.armed,false,'old unacknowledged receipt blocks readiness');
 f.cnc.runner.emit('ok',{});for(let i=0;i<15;i++)await f.cycle();assert.equal(f.s.armed,true,f.s.reason);assert.equal(f.writes.length,1);
 f.s.disconnect();f.time(f.now()+10000);f.s.ui(f.body);f.s.tick();await turn();assert.equal(f.ports.length,2);
});

test('automatic INPUT status snapshots do not cancel a held physical XY pad in either jog mode',async()=>{
 for(const mode of ['step','adaptive']){
  const f=fixture();await f.ready();f.s.setMode(mode);
  for(let i=0;i<15;i++)await f.cycle({selection:2,page:1,epoch:2});
  assert.equal(f.s.armed,true,f.s.reason);
  const g=f.s.gate,p=f.ports.at(-1);
  f.receive(p,`P2 PAD ${boot} ${g.session} 1 ${g.ticket} 2 1 H 1 0 0 500`);await turn();
  assert.equal(f.s.machine.touch.busy(),true);assert.equal(f.writes.length,1);
  await f.cycle({selection:2,page:1,epoch:2,neutral:0});
  assert.equal(f.s.machine.touch.busy(),true);assert.equal(f.commands.filter(c=>c[0]==='jog:stop').length,0);
  f.s.disconnect();
 }
});

for(const transport of ['usb','ble'])test(transport+': bounded factory hold through real service stops on release or its fixed cap',async()=>{
 for(const release of [true,false]){
  const f=fixture(transport);await f.ready();
  try {
   for(let i=0;i<15;i++)await f.cycle({selection:2,page:1,epoch:2});
   assert.equal(f.s.armed,true,f.s.reason);
   const p=f.ports.at(-1),g=f.s.gate;
   f.receive(p,`P2 PAD ${boot} ${g.session} 1 ${g.ticket} 2 1 B 1 0 0 500`);await turn();
   assert.equal(f.s.machine.touch.busy(),true);assert.equal(f.writes.length,1);
   if(release)f.receive(p,`P2 PAD ${boot} ${g.session} 2 ${g.ticket} 2 1 S 1 0 30 500`);
   f.cnc.runner.state.status.activeState='Jog';
   for(let i=0;i<(release?2:27);i++){
    f.cnc.runner.emit('ok',{});
    await f.cycle({selection:2,page:1,epoch:2,neutral:0});
   }
   assert.equal(f.commands.filter(c=>c[0]==='jog:stop').length,1);
   assert.ok(f.writes.length<=2,'stationary ACKs cannot free the motion window');
   const count=f.writes.length;
   f.receive(p,`P2 PAD ${boot} ${g.session} ${release?3:2} ${g.ticket} 2 1 B 1 0 0 500`);
   await turn();assert.equal(f.writes.length,count,'duplicate cannot restart held motion');
  }finally{f.s.disconnect();}
 }
});

for(const obstruction of ['none','held','job','alarm'])test('ESP boot change reconnects with fresh neutral and no replay: '+obstruction,async()=>{
 const f=fixture(),p=await f.ready(),old=f.s.gate.session,newBoot='fedcba9876543210';
 await f.cycle({neutral:0,count:8,direction:1,period:4});
 f.receive(p,`P2 HELLO ${newBoot} 2 1 0`);
 assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);assert.equal(f.s.gate,null);assert.equal(f.s.reconnectWanted,true);
 assert.ok(f.commands.some(c=>c[0]==='jog:stop'));
 f.offline(true);
 for(let i=0;i<5;i++){f.time(f.s.retryAt);f.s.ui(f.body);f.status();f.s.tick();await turn();assert.equal(f.s.armed,false);assert.equal(f.s.reconnectWanted,true);}
 assert.ok(f.now()>5000,'downtime exceeds authentication timeout');
 f.offline(false);f.time(f.s.retryAt);f.s.ui(f.body);f.status();f.s.tick();await turn();
 const next=f.ports.at(-1);f.receive(next,`P2 HELLO ${newBoot} 2 1 0`);f.s.tick();
 assert.notEqual(f.s.gate.session,old);assert.equal(f.s.gate.boot,newBoot);
 for(let i=0;i<12;i++)await f.cycle();assert.equal(f.s.armed,false,'outstanding pre-reboot CNC receipt still blocks readiness');
 f.cnc.runner.emit('ok',{});
 if(obstruction==='job')f.cnc.workflow.state='running';if(obstruction==='alarm')f.cnc.runner.state.status.activeState='Alarm';
 for(let i=0;i<15;i++)await f.cycle({neutral:obstruction==='held'?0:1});
 assert.equal(f.s.armed,obstruction==='none',f.s.reason);assert.equal(f.writes.length,1,'old movement never replayed');
 if(obstruction!=='none'){
  f.cnc.workflow.state='idle';f.cnc.runner.state.status.activeState='Idle';
  for(let i=0;i<6;i++)await f.cycle();assert.equal(f.s.armed,false,'requires new 300ms neutral interval');
  for(let i=0;i<10;i++)await f.cycle();assert.equal(f.s.armed,true,f.s.reason);
 }
 assert.equal(f.writes.length,1);f.s.disconnect();
});

for(const transport of ['usb','ble'])test(transport+': tablet XY contact survives the knob acknowledging its automatic disable',async()=>{
 const f=fixture(transport);await f.ready();
 try {
  assert.equal(f.s.tabletStatus().ready,true);
  const context=f.s.gate.inputContext;
  let lease=f.s.beginTabletPad({visible:true,rapid:1000});
  assert.equal(f.s.armed,false);assert.equal(f.s.tabletPad.busy(),true);
  for(let i=0;i<12;i++){
   lease=f.s.tabletPad.update({...lease,x:0,y:0});await f.cycle();
   assert.equal(f.s.tabletPad.busy(),true,'disabling the knob must not cancel the tablet: '+f.s.reason);
   assert.equal(f.s.armed,false,'the knob cannot reclaim a held tablet contact');
  }
  assert.ok(f.s.gate.inputContext>context,'knob processed the disable context');
  lease=f.s.tabletPad.update({...lease,x:.7,y:.4});f.s.tick();
  assert.equal(f.writes.length,1);assert.match(f.writes[0],/^\$J=G21G91 X.* Y/);
  f.cnc.runner.emit('ok',{});f.s.tabletPad.end(lease.token);
  for(let i=0;i<16;i++)await f.cycle();
  assert.equal(f.s.armed,true);assert.equal(f.writes.length,1,'returning control never replays motion');
 }finally{f.s.disconnect();}
});

test('tablet handover still stops on changed knob controls or a non-neutral disable acknowledgement',async()=>{
 for(const options of [{selection:1},{page:1,epoch:2},{neutral:0},{ready:0}]){
  const f=fixture();await f.ready();
  try {
   const lease=f.s.beginTabletPad({visible:true,rapid:1000});
   f.s.tabletPad.update({...lease,x:.7,y:.4});
   await f.cycle(options);
   assert.equal(f.s.tabletPad.busy(),false,JSON.stringify(options));
   assert.equal(f.s.armed,false);
   assert.ok(f.commands.some(c=>c[0]==='jog:stop'),'changed/held controls cancel tablet motion');
   assert.throws(()=>f.s.tabletPad.update({...lease,x:1,y:0}),/Knob controls changed; release briefly/);
  }finally{f.s.disconnect();}
 }
});
