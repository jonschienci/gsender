'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {tiltVector,TiltSession}=require('../ui/tilt-session.cjs');
const {padVector}=require('../ui/pad-vector.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function gravity(degrees,heading=0){const a=degrees*Math.PI/180,h=heading*Math.PI/180;return {x:-Math.sin(a)*Math.cos(h)*9.81,y:-Math.sin(a)*Math.sin(h)*9.81,z:Math.cos(a)*9.81};}
function fixture(handler){
 let time=0,seq=0,ticket=0;const calls=[],states=[],points=[];
 const session=new TiltSession({now:()=>time,onState:s=>states.push(s),onPoint:p=>points.push(p),post:async(action,body)=>{calls.push({action,body});if(handler)return handler(action,body);return action==='begin'?{token:'t',ticket:String(++ticket)}:action==='move'?{ticket:String(++ticket)}:{ok:true};}});
 const tick=async(degrees=0,overrides={},dt=40)=>{time+=dt;session.tick({active:true,valid:true,ageMs:0,seq:++seq,rotation:0,...gravity(degrees),...overrides});await flush();};
 const neutral=async()=>{for(let i=0;i<12;i++)await tick();};
 return {session,calls,states,points,tick,neutral,time:()=>time,setTime:n=>time=n};
}
test('tilt has a flat 6-degree dead zone and smooth radial speed up to the selected preset at 40 degrees',()=>{
 for(const d of [0,.01,1,3,5.99,6]){const p=tiltVector(gravity(d));assert.equal(p.neutral,true);assert.equal(padVector(p.x,p.y).speed,0);}
 let last=0;
 for(let i=0;i<=1000;i++){const p=tiltVector(gravity(6+i*34/1000)),v=padVector(p.x,p.y);assert.ok(v.speed>=last-1e-12&&v.speed-last<.002);last=v.speed;}
 assert.ok(Math.abs(last-1)<1e-12);
 assert.ok(padVector(tiltVector(gravity(25)).x,0).speed<.6,'25 degrees no longer reaches full speed');
 assert.equal(padVector(tiltVector(gravity(50)).x,0).speed,1);
 for(const angle of [0,45,90,180,225,270]){const p=tiltVector(gravity(40,angle));assert.ok(Math.abs(padVector(p.x,p.y).speed-1)<1e-12);}
 assert.ok(tiltVector(gravity(10)).x>0);assert.ok(tiltVector(gravity(10,90)).y>0);
 for(const input of [{x:NaN,y:0,z:9.81},{x:0,y:0,z:0},{x:0,y:0,z:-9.81},gravity(61),{x:14,y:0,z:9}])assert.equal(tiltVector(input),null);
});
test('enable while tilted never starts; only fresh continuous flat samples start a zero-speed session',async()=>{
 const f=fixture();f.session.enable();for(let i=0;i<20;i++)await f.tick(15);assert.equal(f.calls.length,0);
 for(let i=0;i<8;i++)await f.tick();assert.equal(f.calls.length,0);
 await f.neutral();assert.equal(f.calls.filter(c=>c.action==='begin').length,1);
 assert.ok(f.calls.filter(c=>c.action==='move').every(c=>c.body.x===0&&c.body.y===0));
 await f.tick(15);assert.ok(f.calls.at(-1).body.x>0);assert.equal(f.session.phase,'Tilting');
 await f.tick(0);assert.equal(f.calls.at(-1).body.x,0);assert.equal(f.session.phase,'Ready');
});
test('duplicate, stale, invalid or missing samples stop and cannot replay a held tilt',async()=>{
 for(const broken of [{valid:false},{active:false},{ageMs:150},{seq:0},{z:-9.81},{rotation:1}]){
  const f=fixture();f.session.enable();await f.neutral();await f.tick(15);
  for(let i=0;i<5;i++)await f.tick(15,broken);
  assert.ok(f.calls.some(c=>c.action==='end'),JSON.stringify(broken));
  const beginCount=f.calls.filter(c=>c.action==='begin').length;
  for(let i=0;i<20;i++)await f.tick(15);
  assert.equal(f.calls.filter(c=>c.action==='begin').length,beginCount);
  await f.neutral();assert.ok(f.calls.filter(c=>c.action==='begin').length>beginCount);
 }
});
test('an event-loop stall requires flat again even when the next sensor sample is fresh',async()=>{
 const f=fixture();f.session.enable();await f.neutral();await f.tick(20);
 await f.tick(20,{},300);assert.equal(f.calls.at(-1).action,'end');
 for(let i=0;i<10;i++)await f.tick(20);assert.equal(f.calls.filter(c=>c.action==='begin').length,1);
});
test('preset changes preserve the tilt lease and apply the new ceiling on fresh samples',async()=>{
 const f=fixture();f.session.setFeed(1000);f.session.enable();await f.neutral();await f.tick(15);
 const lease=f.session.lease.token;
 f.session.setFeed(5000);await f.tick(15);
 assert.equal(f.session.enabled,true);assert.equal(f.session.lease.token,lease);
 assert.equal(f.calls.at(-1).body.rapid,5000);assert.ok(f.calls.at(-1).body.x>0);
 assert.equal(f.calls.filter(c=>c.action==='begin').length,1);
 f.session.setFeed(200);await f.tick(15);assert.equal(f.calls.at(-1).body.rapid,200);
 f.session.setFeed(NaN);await f.tick(15);assert.equal(f.session.lease,null);
});
test('late begin after disable is ended and never produces motion',async()=>{
 let resolve;const f=fixture(action=>action==='begin'?new Promise(r=>resolve=r):{ok:true});
 f.session.enable();await f.neutral();assert.ok(resolve);f.session.disable();resolve({token:'late',ticket:'one'});await flush();
 assert.deepEqual(f.calls.at(-1),{action:'end',body:{token:'late'}});
 await f.tick(20);assert.equal(f.calls.some(c=>c.action==='move'),false);
});
test('delayed challenge resync or a failed connection requires flat before resuming',async()=>{
 for(const fault of ['resync','error']){
  let fail=false;const f=fixture(action=>{if(action==='begin')return {token:'t',ticket:'1'};if(action==='move'&&fail){if(fault==='error')throw Error('CNC disconnected');return {ticket:'2',resync:true};}return {ticket:'2'};});
  f.session.enable();await f.neutral();fail=true;await f.tick(20);assert.equal(f.session.lease,null);
  const count=f.calls.filter(c=>c.action==='begin').length;for(let i=0;i<12;i++)await f.tick(20);
  assert.equal(f.calls.filter(c=>c.action==='begin').length,count);
 }
});

test('Z hold and tap share the calibrated tilt session without resetting flat neutral',async()=>{
 const f=fixture();f.session.enable();await f.neutral();await f.tick(20);const token=f.session.lease.token;
 f.session.setZHold(1);await f.tick(20);assert.ok(f.calls.at(-1).body.x>0);assert.equal(f.calls.at(-1).body.z,1);
 f.session.setZHold(0);await f.tick(20);assert.ok(f.calls.at(-1).body.x>0);assert.equal(f.calls.at(-1).body.z,0);
 f.session.stepZ(-.1);await f.tick(20);assert.equal(f.calls.at(-1).body.zStep.distance,-.1);
 await f.tick(20);assert.equal(f.calls.at(-1).body.zStep,undefined);assert.ok(f.calls.at(-1).body.x>0);
 assert.equal(f.session.lease.token,token);assert.equal(f.calls.filter(c=>c.action==='begin').length,1);
 assert.equal(f.calls.some(c=>c.action==='end'),false);
});
test('Z is usable during flat calibration without authorizing XY; a UI stall clears both axes',async()=>{
 const f=fixture();f.session.enable();await f.tick(20);f.session.setZHold(1);
 await f.tick(20);await f.tick(20);
 assert.equal(f.calls.at(-1).body.z,1);assert.equal(f.calls.at(-1).body.x,0);assert.equal(f.session.calibrated,false);
 f.session.setZHold(0);await f.tick(20);assert.equal(f.calls.at(-1).body.z,0);assert.equal(f.calls.at(-1).body.x,0);
 await f.neutral();await f.tick(20);assert.ok(f.calls.at(-1).body.x>0);
 f.session.setZHold(-1);await f.tick(20);await f.tick(20,{},300);
 assert.equal(f.session.zHold,0);assert.equal(f.session.lease,null);
});
test('an expired Z tap cannot execute after a delayed session begin',async()=>{
 let release;const f=fixture((action)=>action==='begin'?new Promise(resolve=>release=resolve):{ticket:'next'});
 f.session.enable();f.session.stepZ(.1);await f.tick(20);
 for(let i=0;i<7;i++)await f.tick(20);
 release({token:'late',ticket:'1'});await flush();await f.tick(20);
 assert.equal(f.calls.at(-1).body.zStep,undefined);assert.equal(f.calls.at(-1).body.z,0);assert.equal(f.calls.at(-1).body.x,0);
});

test('explicit Z works with invalid tilt angle or stale sensor readings, without any XY',async()=>{
 for(const sensor of [{z:-9.81},{valid:false,ageMs:200}]) {
  const f=fixture();f.session.enable();f.session.setZHold(1);
  for(let i=0;i<8;i++)await f.tick(20,sensor);
  const moves=f.calls.filter(c=>c.action==='move');assert.ok(moves.length>3);
  assert.ok(moves.every(c=>c.body.x===0 && c.body.y===0 && c.body.z===1));
  assert.equal(f.session.calibrated,false);
  f.session.setZHold(0);await f.tick(20,sensor);assert.equal(f.calls.at(-1).body.z,0);
 }
 const f=fixture();f.session.enable();await f.neutral();f.session.setZHold(1);await f.tick(20);
 await f.tick(20,{valid:false});await f.tick(20,{valid:false});
 assert.ok(f.calls.some(c=>c.action==='end'),'lost sensor cancels queued XY');
 assert.equal(f.calls.at(-1).body.x,0);assert.equal(f.calls.at(-1).body.z,1);
});

test('display point follows screened tilt input and centers for dead zone, interruption and recovery',async()=>{
 let recovering=false;
 const f=fixture(action=>action==='begin'?{token:'t',ticket:'1'}:{ticket:'next',recovering});
 f.session.enable();await f.tick(20);assert.deepEqual(f.points.at(-1),{x:0,y:0});
 await f.neutral();await f.tick(40);assert.ok(f.points.at(-1).x>.9999);assert.equal(f.points.at(-1).y,0);
 await f.tick(20);assert.equal(f.points.at(-1).x,f.calls.at(-1).body.x);assert.ok(f.points.at(-1).x<1);
 await f.tick(5);assert.deepEqual(f.points.at(-1),{x:0,y:0});
 await f.tick(20);recovering=true;await f.tick(20);assert.deepEqual(f.points.at(-1),{x:0,y:0});
 recovering=false;await f.tick(20);await f.tick(20);assert.ok(f.points.at(-1).x>0);
 await f.tick(20,{valid:false});assert.deepEqual(f.points.at(-1),{x:0,y:0});
 await f.neutral();await f.tick(20);f.session.disable();assert.deepEqual(f.points.at(-1),{x:0,y:0});
});
