'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Pendant}=require('../pendant/service.cjs');
const {Gate}=require('../pendant/protocol.cjs');
const {WifiNetwork}=require('../runtime/wifi-network.cjs');
const {BleNetwork}=require('../runtime/ble-network.cjs');
for(const transport of ['wifi','ble']){
const boot='0123456789abcdef', QR=(transport==='ble'?'GSB1:123456ABCDEF:000.000.000.000:':'GSK1:123456ABCDEF:192.168.1.80:')+'A7'.repeat(32);
const json=JSON.stringify({version:1,device:'wisecoco-123456abcdef',...(transport==='ble'?{transport:'ble'}:{host:'192.168.1.80',port:58596}),psk:'a7'.repeat(32)});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let now=0, opened=0;const ports=[],writes=[],commands=[];
 const raw={isOpen:true,writableLength:0,writableCorked:false,writeBounded(){}};
 const cnc={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{'$13':'0','$110':'2000','$111':'2000','$112':'1000','$120':'100','$121':'100','$122':'100'}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},connection:new EventEmitter(),runner:new EventEmitter(),
  isOpen:()=>true,command(cmd,...args){commands.push([cmd,...args]);},writeln(line){writes.push(line);}};
 cnc.connection.connection={port:raw};cnc.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 class Port extends EventEmitter{
  constructor(config){super();this.path=transport+':'+config.device;this.writes=[];ports.push(this);}
  open(cb){opened++;this.isOpen=true;cb();}
  write(bytes,cb){this.writes.push(bytes.toString());cb();}
  destroy(){if(this.destroyed)return;this.destroyed=true;this.isOpen=false;this.emit('close');}
 }
 const network=new (transport==='ble'?BleNetwork:WifiNetwork)(()=>{});
 const s=new Pendant({wifiNetwork:network,bleNetwork:network,SerialPort:{list:async()=>{throw Error('Must not open USB knob');}},getControllers:()=>({cnc}),WifiTransport:Port,BleTransport:Port,now:()=>now});
 s.setTransport(transport);
 const body={session:'a'.repeat(32),visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000}};
 const status=()=>cnc.runner.emit('status',cnc.runner.state.status);
 function receive(p,line){p.emit('data',Buffer.from(line+'\n'));}
 function hello(p,b=boot){receive(p,`P2 HELLO ${b} 2 1 0`);s.tick();status();}
 function echo(p,{ready=true,neutral=true,page=0,epoch=3,cap=true}={}){
  const g=s.gate;if(!g)return;const prefix=`${g.boot} ${g.session} ${g.ticket}`;
  receive(p,`P2 ALIVE ${prefix} ${+ready} 0 0 500`);
  receive(p,`P2 PCAP ${prefix} 1 ${page} ${epoch}`);
  if(cap)receive(p,`P2 NCAP ${prefix} 1 ${+neutral}`);
  receive(p,`P2 VCAP ${prefix} 1`);
 }
 async function cycle(p,opts={}){now+=40;s.ui(body);status();s.tick();echo(p,opts);await turn();}
 async function ready(){s.setTransport(transport);s.configurePairing(json);s.ui(body);await s.connect();const p=ports.at(-1);hello(p);echo(p);await turn();return p;}
 async function retry(){now+=500;s.ui(body);status();s.tick();await turn();const p=ports.at(-1);hello(p);echo(p);await turn();return p;}
 return {s,network,cnc,raw,body,ports,writes,commands,ready,retry,cycle,echo,hello,receive,status,time:n=>now=n,now:()=>now,opened:()=>opened};
}
test(transport+': scan is a single action: saves pairing and starts wireless automatically, never arms or moves',async()=>{
 const f=fixture();f.s.ui(f.body);const token=f.s.beginScan();f.s.commitScan(token,QR);await turn();
 assert.equal(f.opened(),1);assert.equal(f.s.status().pairingConfigured,true);assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);assert.equal(f.writes.length,0);
 assert.throws(()=>f.s.commitScan(token,QR));f.s.disconnect();
});
test(transport+': fresh not-ready heartbeats keep page rendering connected beyond six seconds',async()=>{
 const f=fixture(),p=await f.ready();
 for(let i=0;i<310;i++)await f.cycle(p,{ready:false,neutral:false,page:1,epoch:4});
 assert.equal(f.s.port,p);assert.equal(f.s.armed,false);assert.equal(f.opened(),1);assert.equal(f.writes.length,0);
 await f.cycle(p,{page:1,epoch:4});assert.equal(f.s.status().ready,true);f.s.disconnect();
});
test(transport+': Wireless loss cancels motion, drains receipts, restores armed intent only after fresh neutral handshake, no replay',async()=>{
 const f=fixture(),p=await f.ready();f.s.arm(f.body);await f.cycle(p);const old=f.s.gate;
 f.receive(p,`P2 DETENT ${boot} ${old.session} 1 ${old.ticket} X 1 500`);f.s.tick();assert.equal(f.writes.length,1);
 p.destroy();assert.equal(f.s.armed,false);assert.equal(f.s.status().armRequested,true);assert.equal(f.s.machine.queue.length,0);
 assert.equal(f.commands.filter(c=>c[0]==='jog:stop').length,1);
 const next=await f.retry();assert.notEqual(f.s.gate.session,old.session);
 for(let i=0;i<12;i++)await f.cycle(next);
 assert.equal(f.s.armed,false,'unacknowledged pre-loss motion must block recovery');
 f.cnc.runner.emit('ok',{});await f.cycle(next);
 assert.equal(f.s.armed,true);assert.equal(f.writes.length,1,'pre-loss movement never replayed');
 const g=f.s.gate;const disarmedTicket=[...g.tickets].filter(([,t])=>!t.armed).at(-1)[0];
 // A newly queued STATE after recovery must grant the motion ticket.
 await f.cycle(next);
 f.receive(next,`P2 DETENT ${boot} ${g.session} 1 ${disarmedTicket} X 1 500`);
 f.s.tick();assert.equal(f.writes.length,1);
 f.receive(next,`P2 DETENT ${boot} ${g.session} 2 ${g.ticket} X 1 500`);f.s.tick();assert.equal(f.writes.length,2);
 f.s.disconnect();
});
test(transport+': no neutral capability or held controls prevent automatic re-arming',async()=>{
 for(const opts of [{cap:false},{neutral:false}]){
  const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();const next=await f.retry();
  for(let i=0;i<25;i++)await f.cycle(next,opts);
  assert.equal(f.s.armed,false);assert.equal(f.s.status().armRequested,true);assert.equal(f.writes.length,0);f.s.disconnect();
 }
});
test(transport+': manual disarm during retry clears intent but still reconnects disarmed; disconnect stops retries',async()=>{
 const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();f.s.disarm();const next=await f.retry();
 for(let i=0;i<12;i++)await f.cycle(next);assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);
 f.s.disconnect();f.time(10000);f.s.ui(f.body);f.s.tick();await turn();assert.equal(f.opened(),2);assert.equal(f.s.reconnectWanted,false);
});
test(transport+': settings, mode, UI, board, page, boot, alarm, other controls and native background revoke retained arm',async()=>{
 const changes=[
  f=>f.s.ui({...f.body,visible:false}),f=>f.s.ui({...f.body,session:'b'.repeat(32)}),
  f=>f.s.ui({...f.body,preset:{...f.body.preset,feedrate:500}}),f=>f.s.setMode('adaptive'),
  f=>{f.cnc.settings.settings.$110='1000';},f=>{f.cnc.connection.connection.port={...f.raw};},
  f=>f.cnc.runner.emit('alarm',{}),f=>f.cnc.command('jog:start','X',1),
  f=>{f.cnc.workflow.state='running';},f=>{f.cnc.runner.state.status.activeState='Alarm';}
 ];
 for(const change of changes){const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();change(f);const next=await f.retry();
  for(let i=0;i<12;i++)await f.cycle(next);assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);f.s.disconnect();}
 for(const variant of ['page','boot','background']){const f=fixture(),p=await f.ready();f.s.arm(f.body);
  if(variant==='background')p.emit('error',Object.assign(Error('Background'),{code:'WIFI_FOREGROUND'}));else p.destroy();
  f.time(500);f.s.ui(f.body);f.status();f.s.tick();await turn();const next=f.ports.at(-1);f.hello(next,variant==='boot'?'f'.repeat(16):boot);
  for(let i=0;i<12;i++)await f.cycle(next,variant==='page'?{page:1,epoch:4}:{});
  assert.equal(f.s.armed,false);assert.equal(f.s.resumeArm,null);f.s.disconnect();}
});
test(transport+': retries back off and pause when UI heartbeat stops; stale old-port callbacks cannot replace a new connection',async()=>{
 const f=fixture(),p=await f.ready();p.destroy();assert.equal(f.s.retryAt-f.now(),500);
 assert.equal(f.s.status().lastConnectionIssue,'Knob link lost');
 f.time(499);f.s.tick();await turn();assert.equal(f.opened(),1);
 const next=await f.retry();assert.equal(f.opened(),2);p.emit('close');assert.equal(f.s.port,next);
 assert.equal(f.s.status().lastConnectionIssue,'Knob link lost','retry must not erase the failure reason');
 f.s.arm(f.body);next.destroy();f.time(f.now()+1600);f.s.tick();await turn();assert.equal(f.opened(),2);assert.equal(f.s.resumeArm,null);f.s.disconnect();
});
test(transport+': fresh advancing neutral proof is required: duplicates, stale tickets, gaps and held evidence reset or cannot renew',()=>{
 let now=0;const g=new Gate(boot,()=>now,true);
 const send=(neutral,ticket=g.ticket)=>g.receive(`P2 NCAP ${boot} ${g.session} ${ticket} 1 ${+neutral}`);
 const issue=()=>{g.state([0,0,0],true,'PAD_R_READY');g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`);};
 issue();send(true);now=80;send(true);assert.equal(g.neutralAt,0);
 for(now=80;now<=320;now+=80){issue();send(true);}now=320;assert.equal(g.neutralReady(),true);
 issue();send(false);assert.equal(g.neutralReady(),false);now=360;issue();send(true);assert.equal(g.neutralReady(),false);
 now=460;send(true);assert.equal(g.neutralAt,360);
 assert.throws(()=>g.receive(`P2 NCAP ${boot} ${'f'.repeat(32)} 1 1 1`));
});

test(transport+': native background during retry clears intent even without an active lease, foreground returns disarmed',async()=>{
 const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();
 f.network.receive({state:'foreground',visible:false});assert.equal(f.s.resumeArm,null);
 f.time(800);f.s.ui(f.body);f.s.tick();await turn();assert.equal(f.opened(),1);
 f.network.receive({state:'foreground',visible:true});f.s.tick();await turn();
 const next=f.ports.at(-1);f.hello(next);for(let i=0;i<12;i++)await f.cycle(next);
 assert.equal(f.opened(),2);assert.equal(f.s.armed,false);f.s.disconnect();
});

test(transport+': rapid background/foreground before retry tick cannot retain the previous arm request',async()=>{
 const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();
 f.network.receive({state:'foreground',visible:false});
 f.network.receive({state:'foreground',visible:true});
 assert.equal(f.s.resumeArm,null);const next=await f.retry();
 for(let i=0;i<12;i++)await f.cycle(next);
 assert.equal(f.s.armed,false);f.s.disconnect();
});

test(transport+': manual Arm reports held controls instead of claiming armed before firmware accepts',async()=>{
 const f=fixture(),p=await f.ready();await f.cycle(p,{neutral:false});
 assert.throws(()=>f.s.arm(f.body),/Release the knob controls/);assert.equal(f.s.armed,false);
 await f.cycle(p);f.s.arm(f.body);assert.equal(f.s.armed,true);f.s.disconnect();
});

test(transport+': QR connects and retries without a valid jog preset; invalid settings revoke motion intent',async()=>{
 for(const preset of [undefined,{xyStep:NaN,zStep:.1,feedrate:1000}]){
  const f=fixture(),body={...f.body,preset};f.s.ui(body);
  const token=f.s.beginScan();f.s.commitScan(token,QR);await turn();
  assert.equal(f.opened(),1);assert.equal(f.s.uiPreset,null);assert.equal(f.s.armed,false);
  const p=f.ports.at(-1);f.hello(p);f.echo(p);p.destroy();
  f.time(600);f.s.ui(body);f.s.tick();await turn();assert.equal(f.opened(),2);
  assert.throws(()=>f.s.arm(body));assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);f.s.disconnect();
 }
 const f=fixture(),p=await f.ready();f.s.arm(f.body);p.destroy();
 f.s.ui({...f.body,preset:undefined});assert.equal(f.s.resumeArm,null);
 const next=await f.retry();for(let i=0;i<12;i++)await f.cycle(next);
 assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);f.s.disconnect();
});
test(transport+': hidden UI immediately stops connection retries even with a previously fresh heartbeat',async()=>{
 const f=fixture(),p=await f.ready();p.destroy();f.time(500);
 f.s.ui({...f.body,visible:false});f.s.tick();await turn();assert.equal(f.opened(),1);f.s.disconnect();
});

}
