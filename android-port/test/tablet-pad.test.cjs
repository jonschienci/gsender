'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Controller}=require('../pendant/controller.cjs');
const {TabletPad}=require('../pendant/tablet-pad.cjs');
const {padVector}=require('../ui/pad-vector.cjs');
function fixture(){
 let now=0;const writes=[],commands=[],faults=[];
 const c={type:'GrblHAL',options:{port:'android-usb:42:0'},settings:{settings:{$13:'0',$110:'3000',$111:'2000',$112:'700',$122:'25',$120:'100',$121:'50'}},
  workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},
  connection:new EventEmitter(),runner:new EventEmitter(),isOpen:()=>true,
  command:(...args)=>commands.push(args),writeln:line=>writes.push(line)};
 c.connection.connection={port:{isOpen:true,writableLength:0,writableCorked:false,writeBounded(){}}};
 c.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
 const m=new Controller(()=>({c}),reason=>{faults.push(reason);m.stop();},()=>now);
 const p=new TabletPad(m,()=>now);m.externalJog=p;m.sync();
 const status=(xyz,state='Idle')=>{if(xyz)c.runner.state.status.mpos={x:xyz[0],y:xyz[1],z:xyz[2]};c.runner.state.status.activeState=state;c.runner.emit('status');};
 status();let ticket;
 const begin=(rapid=5000,allowZ=false)=>ticket=p.begin(rapid,allowZ);
 const update=(x,y,extra={})=>ticket=p.update({...ticket,x,y,...extra});
 const tick=()=>{try{m.tick();}catch(e){faults.push(e.message);m.stop();}};
 return {m,p,c,writes,commands,faults,status,begin,update,tick,time:n=>now=n,now:()=>now,ack:()=>c.runner.emit('ok'),ticket:()=>({...ticket})};
}
test('radial speed is continuous 0..Rapid, dead center is stationary and diagonals are normalized',()=>{
 let last=0;
 for(let i=0;i<=1000;i++){
  const r=i/1000,v=padVector(r,0);assert.ok(v.speed>=last&&v.speed<=1);assert.ok(v.speed-last<.002);last=v.speed;
 }
 assert.deepEqual(padVector(0,0),{x:0,y:0,speed:0});assert.equal(padVector(.05,0).speed,0);
 for(const [x,y] of [[1,0],[0,-1],[1,1],[-1,-1]])assert.ok(Math.abs(Math.hypot(padVector(x,y).x,padVector(x,y).y)-1)<1e-12);
 for(const [x,y] of [[NaN,0],[Infinity,0],[2,0],['1',0]])assert.throws(()=>padVector(x,y));
});
test('starting, center hold and opening the interface never move the CNC',()=>{
 const f=fixture();f.begin();for(let n=0;n<100;n+=40){f.time(n);f.update(0,0);f.status();f.tick();}
 assert.equal(f.writes.length,0);assert.equal(f.commands.length,0);
});
test('diagonal feed respects Rapid and each axis maximum, uses finite bounded XY segments',()=>{
 const f=fixture();f.begin(2500);
 for(let n=0;n<1500;n+=40){
  f.time(n);f.update(1,1);if(f.p.segments.length){const end=f.p.segments.at(-1).target;while(f.p.segments.some(s=>!s.acked))f.ack();f.status(end);}else f.status();f.tick();
 }
 assert.deepEqual(f.faults,['CNC connection changed; arm again explicitly']);assert.ok(f.writes.length>20);
 for(const line of f.writes){assert.match(line,/^\$J=G21G91 X\d+\.\d{4} Y\d+\.\d{4} F\d+\.\d{3}$/);assert.ok(Number(line.split(' F')[1])<=2500.001);}
 assert.ok(Number(f.writes.at(-1).split(' F')[1])>2499);
});
test('changing direction follows finite XY paths without accumulating old input',()=>{
 const f=fixture();f.begin(1200);
 for(let n=0;n<1800;n+=40){
  f.time(n);const angle=n/1800*Math.PI/2;f.update(Math.cos(angle),Math.sin(angle));
  if(f.p.segments.length){const end=f.p.segments.at(-1).target;while(f.p.segments.some(s=>!s.acked))f.ack();f.status(end);}else f.status();f.tick();
 }
 assert.equal(f.faults.length,1);assert.ok(f.writes.length>30);assert.ok(f.p.busy());
});
test('queued travel is bounded by position evidence, never cleared just because time passed',()=>{
 const f=fixture();f.begin();
 for(let n=0;n<1200;n+=40){
  f.time(n);f.update(1,0);f.status(undefined,'Jog');f.tick();f.ack();
  assert.ok(f.p.segments.length<=9);
  assert.ok(f.p.segments.reduce((sum,s)=>sum+s.distance*60/s.feed,0)<=.5);
 }
 const count=f.writes.length;assert.ok(count>2 && count<=9);
 for(let n=1200;n<1480;n+=40){f.time(n);f.update(1,0);f.status(undefined,'Jog');f.tick();f.ack();}
 assert.equal(f.writes.length,count,'fresh stationary reports cannot refill the queue');
 f.time(1520);f.update(1,0);f.status(undefined,'Jog');f.tick();
 assert.equal(f.p.busy(),false,'the progress timeout still cancels a stalled planner');
 assert.match(f.faults.at(-1),/motion progress timed out/);
});
test('release cancels exactly once, late packets cannot restart or stop a new contact',()=>{
 const f=fixture();f.begin();f.update(1,0);f.tick();const old=f.ticket();
 f.p.end(old.token);f.p.end(old.token);assert.deepEqual(f.commands,[['jog:stop']]);
 assert.throws(()=>f.p.update({...old,x:1,y:0}));assert.throws(()=>f.begin());
 f.ack();f.time(120);f.status();f.begin();f.p.end(old.token);assert.ok(f.p.busy());
 assert.throws(()=>f.p.update({...old,x:1,y:0}));assert.ok(f.p.busy());assert.equal(f.writes.length,1);
});
test('long contact loss and duplicate challenge end motion without replay',()=>{
 for(const kind of ['expired','late','duplicate']){
  const f=fixture();f.begin();const old=f.ticket();f.update(1,0);f.tick();
  if(kind==='expired'){f.time(2000);f.status(undefined,'Jog');f.tick();}
  else {if(kind==='late')f.time(2000);assert.throws(()=>f.p.update({...kind==='late'?f.ticket():old,x:1,y:0}));}
  assert.equal(f.p.busy(),false);assert.equal(f.writes.length,1);assert.deepEqual(f.commands,[['jog:stop']]);
 }
});
test('center and reversal cancel the queued path, requiring cancellation receipt and fresh Idle',()=>{
 for(const x of [0,-1]){
  const f=fixture();f.begin();f.update(1,0);f.tick();f.time(40);f.update(x,0);f.status(undefined,'Jog');f.tick();
  assert.equal(f.p.waitingIdle,true);assert.equal(f.writes.length,1);
  f.time(140);f.update(-1,0);f.status();f.tick();assert.equal(f.writes.length,1);
  f.ack();f.time(180);f.update(-1,0);f.status();f.tick();assert.equal(f.writes.length,2);assert.match(f.writes[1],/X-/);
 }
});
test('busy machine, invalid settings, rotary mode and stale position cannot start a touch',()=>{
 for(const change of [f=>f.c.workflow.state='running',f=>f.c.settings.settings.$13='?',f=>f.c.settings.settings.$120='0',f=>f.c.isInRotaryMode=true,f=>f.time(800),f=>f.c.connection.connection.port.writableLength=1]){
  const f=fixture();change(f);assert.throws(()=>f.begin());assert.equal(f.writes.length,0);
 }
});
test('alarms, other controls, connection changes and edited limits cancel a live touch',()=>{
 for(const change of [f=>f.c.runner.emit('alarm'),f=>assert.throws(()=>f.c.command('jog:start','Z'),/still stopping/),f=>f.c.connection.emit('close'),f=>f.c.settings.settings.$110='100']){
  const f=fixture();f.begin();f.update(1,0);f.tick();change(f);f.tick();assert.equal(f.p.busy(),false);assert.equal(f.writes.length,1);assert.ok(f.commands.some(c=>c[0]==='jog:stop'));
 }
});

test('high Rapid requests and curved motion never exceed either axis speed or total Rapid',()=>{
 const f=fixture();f.begin(10000);
 for(let n=0;n<2500;n+=40){
  f.time(n);const angle=n/2500*Math.PI/2;f.update(Math.cos(angle),Math.sin(angle));
  if(f.p.segments.length){const end=f.p.segments.at(-1).target;while(f.p.segments.some(s=>!s.acked))f.ack();f.status(end);}else f.status();f.tick();
 }
 assert.equal(f.faults.length,1);
 for(const line of f.writes){
  const x=Number(/X(-?[\d.]+)/.exec(line)?.[1]||0),y=Number(/Y(-?[\d.]+)/.exec(line)?.[1]||0),feed=Number(/F([\d.]+)/.exec(line)[1]);
  const distance=Math.hypot(x,y);assert.ok(feed<=10000.001);
  // Command coordinate quantization is 0.0001 mm.
  assert.ok(Math.abs(x)/distance*feed<=3001);assert.ok(Math.abs(y)/distance*feed<=2001);
 }
});

test('tablet errors retain the actual stop cause for that contact instead of a generic expired session',()=>{
 const f=fixture();f.begin();const old=f.ticket();
 f.m.stop('CNC position became stale');
 assert.throws(()=>f.p.update({...old,x:1,y:0}),/CNC position became stale/);
 f.begin();const next=f.ticket();
 assert.throws(()=>f.p.update({...old,x:1,y:0}),/CNC position became stale/);
 assert.equal(f.p.busy(),true,'old contact does not stop the new one');
 f.time(2000);f.status();f.tick();
 assert.throws(()=>f.p.update({...next,x:1,y:0}),/Touch connection lost/);
});

test('finite XY jogging accounts for physical motor-step quantization',()=>{
 const f=fixture();f.c.settings.settings.$100='80';f.c.settings.settings.$101='80';f.c.settings.settings.$102='400';f.begin(1200);
 for(let n=0;n<1200;n+=40){
  f.time(n);f.update(.63,.37);
  if(f.p.segments.length){
   const end=f.p.segments.at(-1).target.map((v,i)=>Math.round(v*[80,80,400][i])/[80,80,400][i]);
   while(f.p.segments.some(s=>!s.acked))f.ack();f.status(end);
  }else f.status();
  f.tick();assert.equal(f.p.busy(),true,f.faults.at(-1));
 }
 assert.ok(f.writes.length>15);
});

// Motor/report rounding must not excuse an unrelated position change or
// turn a stopped status into permission to retire an unacknowledged command.
test('resolution-aware endpoints still require receipts, fresh Idle and the commanded endpoint',()=>{
 for(const variant of ['unacknowledged','stale','stalled','offpath']){
  const f=fixture();f.c.settings.settings.$100='80';f.c.settings.settings.$101='80';f.begin(1200);f.update(.63,.37);f.tick();
  const segment=f.p.segments[0],rounded=segment.target.map((v,i)=>i<2?Math.round(v*80)/80:v);
  if(variant!=='unacknowledged')f.ack();
  f.time(40);f.update(.63,.37);
  if(variant!=='stale')f.status(variant==='offpath'?[1,1,0]:variant==='stalled'?[0,0,0]:rounded,variant==='stalled'?'Jog':'Idle');
  f.tick();
  if(variant==='offpath')assert.equal(f.p.busy(),false);
  else assert.ok(f.p.segments.includes(segment),variant+' cannot retire an uncertain endpoint');
 }
});

test('a status received before the movement receipt cannot finish a rounded endpoint',()=>{
 const f=fixture();f.c.settings.settings.$100='80';f.c.settings.settings.$101='80';f.begin(1200);f.update(.63,.37);f.tick();
 const segment=f.p.segments[0],rounded=segment.target.map((v,i)=>i<2?Math.round(v*80)/80:v);
 f.status(rounded);f.ack();f.time(40);f.update(.63,.37);f.tick();
 assert.ok(f.p.segments.includes(segment),'must wait for a status after the receipt');
 f.time(80);f.status(rounded);f.update(.63,.37);f.tick();assert.equal(f.p.segments.includes(segment),false);
});

test('XY planner maintains speed with acceleration, delayed ACKs and discrete position reports',()=>{
 const {simulate}=require('./helpers/tablet-pad-planner.cjs');
 for(const config of [{feed:1200},{feed:3000},{feed:5000},{feed:5000,statusMs:60,latencyMs:20}]){
  const result=simulate(config),context=JSON.stringify(result);
  assert.deepEqual(result.faults,[],context);
  assert.ok(result.average>=result.feed*.98,context);
  assert.ok(result.min>=result.feed*.94,context);
  assert.ok(result.max<=result.feed+.001,context);
  assert.ok(result.maxAhead<=.5 && result.maxSegments<=9,context);
 }
});

test('a full XY planner is cancelled on release, reversal, expired touch and lost position',()=>{
 for(const stop of ['release','reverse','expired','position']){
  const f=fixture();f.begin();
  for(let n=0;n<=320;n+=40){f.time(n);f.update(1,0);f.status(undefined,'Jog');f.tick();f.ack();}
  assert.ok(f.p.segments.length>2,'exercise cancellation of the deeper planner');
  const count=f.writes.length;
  if(stop==='release')f.p.end(f.ticket().token);
  if(stop==='reverse'){f.time(340);f.update(-1,0);f.tick();}
  if(stop==='expired'){f.time(570);f.status(undefined,'Jog');f.tick();}
  if(stop==='position'){
   for(let n=360;n<=1080;n+=40){f.time(n);f.update(1,0);}
   f.tick();
  }
  assert.deepEqual(f.commands,[['jog:stop']],stop);
  assert.equal(f.p.segments.length,0,stop);
  f.tick();assert.equal(f.writes.length,count,stop+' cannot replay queued moves');
 }
});

test('ordinary tablet scheduling jitter does not discard a held contact',()=>{
 const f=fixture();f.begin();
 for(let n=220;n<=880;n+=220){f.time(n);const response=f.update(0,0);assert.equal(response.resync,undefined);assert.equal(f.p.busy(),true);}
 assert.equal(f.writes.length,0);
});

test('short input stalls cancel motion but recover only with a fresh challenge and confirmed Idle',()=>{
 for(const timerRan of [true,false]){
  const f=fixture();f.begin();f.update(1,0);f.tick();
  if(timerRan){f.time(250);f.status(undefined,'Jog');f.tick();}
  f.time(300);const response=f.update(-1,0);
  assert.equal(response.resync,true);assert.equal(f.p.busy(),true);
  assert.deepEqual(f.commands,[['jog:stop']]);assert.deepEqual(f.p.desired,[0,0]);
  assert.equal(f.writes.length,1,'expired direction is discarded');
  f.time(340);f.update(0,1);f.status();f.tick();
  assert.equal(f.writes.length,1,'fresh input cannot bypass the cancellation/ACK barrier');
  f.ack();f.time(420);f.status();f.update(0,1);f.tick();
  assert.equal(f.writes.length,2);assert.match(f.writes[1],/^\$J=G21G91 Y/,'only the newly sampled direction is sent');
 }
});

test('release during touch recovery invalidates its fresh challenge permanently',()=>{
 const f=fixture();f.begin();f.update(1,0);f.tick();f.time(300);const recovery=f.update(1,0);
 assert.equal(recovery.resync,true);f.p.end(recovery.token);
 f.ack();f.time(420);f.status();f.tick();
 assert.throws(()=>f.p.update({...recovery,x:1,y:0}));
 assert.equal(f.p.busy(),false);assert.equal(f.writes.length,1);
 assert.deepEqual(f.commands,[['jog:stop']]);
});

test('live tilt preset replaces the planner ceiling only after cancelling queued motion',()=>{
 const f=fixture();f.begin(2000);f.time(40);f.update(1,0);f.status();f.tick();
 assert.ok(f.writes.length>0);const count=f.writes.length,token=f.p.active;
 const lease=f.p.update({...f.ticket(),x:1,y:0,rapid:300});
 assert.equal(f.p.active,token);assert.equal(f.p.rapid,300);assert.equal(f.p.waitingIdle,true);
 assert.equal(f.p.segments.length,0);assert.equal(f.writes.length,count);
 assert.throws(()=>f.p.update({...lease,x:1,y:0,rapid:Infinity}),/valid jog preset/);
 assert.equal(f.p.active,null);
});

test('tilt combines XYZ in finite segments within vector feed and all three axis limits',()=>{
 const f=fixture();f.begin(5000,true);
 for(let n=0;n<2000;n+=40){
  f.time(n);f.update(.7,.5,{z:1});
  if(f.p.segments.length){while(f.p.segments.some(s=>!s.acked))f.ack();f.status(f.p.segments.at(-1).target);}else f.status();f.tick();
 }
 assert.ok(f.writes.length>30);assert.equal(f.faults.length,1);assert.ok(f.p.busy());
 for(const line of f.writes){
  assert.match(line,/X[\d.]+ Y[\d.]+ Z[\d.]+ F[\d.]+/);
  const delta=['X','Y','Z'].map(a=>Number(new RegExp(a+'(-?[\\d.]+)').exec(line)?.[1]||0));
  const feed=Number(/F([\d.]+)/.exec(line)[1]),norm=Math.hypot(...delta);
  assert.ok(feed<=5000.001);
  for(let i=0;i<3;i++)assert.ok(Math.abs(delta[i])/norm*feed<=[3000,2000,700][i]+.2);
 }
});
test('finite Z tap completes exactly once while flat and while X/Y tilts',()=>{
 for(const x of [0,.6]) {
  const f=fixture();f.begin(600,true);
  for(let n=0;n<1500;n+=40){
   f.time(n);f.update(x,0,{zStep:{id:1,distance:.1}});
   if(f.p.segments.length){while(f.p.segments.some(s=>!s.acked))f.ack();f.status(f.p.segments.at(-1).target);}else f.status();f.tick();
  }
  const total=f.writes.reduce((n,line)=>n+Number(/Z(-?[\d.]+)/.exec(line)?.[1]||0),0);
  assert.ok(Math.abs(total-.1)<1e-9,`Z tap total ${total}`);
  assert.equal(f.commands.length,0,'completion must not cancel the final step before execution');
  if(x)assert.ok(f.writes.some(line=>line.includes('X')&&line.includes('Z')));
  assert.ok(f.p.busy());assert.equal(f.faults.length,1);
 }
});
test('Z release cancels queued Z, preserves the tilt lease and resumes only fresh XY after Idle',()=>{
 const f=fixture();f.begin(600,true);const token=f.ticket().token;
 f.update(.5,.5,{z:1});f.tick();f.ack();f.status(undefined,'Jog');
 f.time(40);f.update(.5,.5,{z:0});f.tick();
 assert.deepEqual(f.commands,[['jog:stop']]);assert.equal(f.p.active,token);assert.equal(f.writes.length,1);
 f.time(160);f.update(.5,.5,{z:0});f.status();f.tick();
 assert.equal(f.writes.length,2);assert.doesNotMatch(f.writes.at(-1),/ Z/);
});
test('Z motion rejects invalid input, stale contact and axis-setting changes; ordinary XY cannot inject Z',()=>{
 for(const input of [{z:1.5},{zStep:{id:1,distance:Infinity}},{zStep:{id:0,distance:1}},{zStep:{id:1,distance:1001}}]){
  const f=fixture();f.begin(600,true);assert.throws(()=>f.update(0,0,input));assert.equal(f.p.busy(),false);assert.equal(f.writes.length,0);
 }
 const plain=fixture();plain.begin();assert.throws(()=>plain.update(0,0,{z:1}));
 for(const change of ['stall','settings']){
  const f=fixture();f.begin(600,true);f.update(.5,0,{z:1});f.tick();
  if(change==='stall'){f.time(300);f.status();}else f.c.settings.settings.$112='500';
  f.tick();assert.ok(f.commands.some(c=>c[0]==='jog:stop'));assert.equal(f.writes.length,1);
 }
});
