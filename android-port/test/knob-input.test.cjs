'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Gate}=require('../pendant/protocol.cjs');
const {Adaptive}=require('../pendant/adaptive.cjs');
const fixture=require('./esp-input-v1-public-fixture.json');
const boot='0123456789abcdef';
function rig(){
 let now=0,seq=0;const g=new Gate(boot,()=>now,true);
 const issue=(arm=false)=>g.state([0,0,0],true,arm?'BVPAD_R_ARMED':'BVPAD_R_READY',arm);
 const input=(opts={})=>g.receive(`P2 INPUT ${boot} ${g.session} ${++seq} ${opts.ticket??g.ticket} ${opts.context??1} ${opts.ready??1} ${opts.fault??0} ${opts.selection??0} ${opts.step??500} ${opts.page??0} ${opts.epoch??1} ${opts.neutral??0} ${opts.plus??0} ${opts.minus??0} ${opts.direction??0} ${opts.period??0} ${opts.age??0}`);
 issue();input();issue(true);input({context:2});issue(true);
 return {g,input,issue,time:n=>now=n};
}
test('actual compiled ESP C INPUT fixture: context baseline, bounded eight-turn burst, age-only repeat and mixed-direction stop',()=>{
 let now=0;const g=new Gate(boot,()=>now,true);g.session='a'.repeat(32);const events=[];
 for(const row of fixture.transcript){
  now=row.at;
  if(row.host){const p=row.host.split(' ');g.state([.1,.2,.3],true,p[9],p[5]==='1');}
  else events.push(g.receive(row.device));
 }
 assert.equal(events[8].expectedEnableTransition,true);
 assert.equal(events[9].count,0,'old pre-boundary ticket cannot move');
 assert.equal(events[10].count,8);assert.equal(events[10].isNew,true);assert.equal(events[10].period,4);
 assert.equal(events[11].isNew,false);assert.ok(events[11].expires<=events[10].expires);
 assert.equal(events[12].direction,0);assert.equal(events[12].count,0);
 assert.equal(events[13].controlsChanged,true);assert.equal(events[14].expectedEnableTransition,false);
 for(const row of fixture.transcript)if(row.device)assert.ok(Buffer.byteLength(row.device+'\n')<=192);
 const worst=`P2 INPUT ${boot} ${g.session} 2147483647 2147483647 2147483647 1 0 3 10000 2 2147483647 0 2147483646 2147483646 -1 65535 10000\n`;
 assert.ok(Buffer.byteLength(worst)<=192,'largest valid frame fits encrypted BLE plaintext limit');
});
test('INPUT replay, dropped/stale turns and later repeats never renew movement or recover counters',()=>{
 const {g,input,issue,time}=rig();
 const first=input({context:2,plus:4,direction:1,period:5});assert.equal(first.count,4);
 time(60);issue(true);const repeat=input({context:2,plus:4,direction:1,period:5,age:60});assert.equal(repeat.expires,first.expires);
 const at=g.aliveAt;g.receive(`P2 INPUT ${boot} ${g.session} 1 1 1 1 0 0 500 0 1 1 0 0 0 0 0`);assert.equal(g.aliveAt,at);
 time(160);assert.equal(input({context:2,plus:8,direction:1,period:5}).direction,0);
 issue(true);assert.equal(input({context:2,plus:8,direction:1,period:5,age:20}).direction,0);
 assert.equal(input({context:2,plus:9,direction:1,period:5}).count,1);
});
test('INPUT errors fail closed: gap, counter regression, oversized burst, malformed context and missing finite speed',()=>{
 for(const bad of [
  {context:2,plus:65,direction:1,period:1},{context:2,plus:2,direction:1,period:0},
  {context:3,plus:1,direction:1,period:5},{context:2,selection:1},
  {context:2,plus:1,minus:1,direction:1,period:5},{context:2,fault:1},
  {context:2,plus:1,direction:1,neutral:1,period:5}
 ]){const r=rig();assert.throws(()=>r.input(bad));}
 const r=rig();r.input({context:2,plus:3,direction:1,period:5});assert.throws(()=>r.input({context:2,plus:2,direction:1,period:5}));
 const a=rig();assert.throws(()=>a.g.receive(`P2 INPUT ${boot} ${a.g.session} 9 ${a.g.ticket} 2 1 0 0 500 0 1 1 0 0 0 0 0`));
 assert.throws(()=>rig().g.receive(`P2 VCAP ${boot} ${'a'.repeat(32)} 1 1`));
});
test('INPUT neutral snapshots between host tickets invalidate release proof immediately',()=>{
 const {g,input,issue,time}=rig();
 for(let n=0;n<=320;n+=40){time(n);issue(true);input({context:2,neutral:1});}
 assert.equal(g.neutralReady(),true);
 time(330);input({context:2,neutral:0});assert.equal(g.neutralReady(),false);
 time(340);input({context:2,neutral:1});assert.equal(g.neutralReady(),false);
 time(700);assert.throws(()=>input({context:2,neutral:1}),/lease expired/);
});
test('an eight-turn measured burst enters adaptive speed without enqueuing eight discrete jogs',()=>{
 let steps=0;const a=new Adaptive({now:()=>0,submitStep:()=>steps++,takeStep:()=>null,limits:()=>({precision:1000,feed:2000})});
 a.input({axis:'X',direction:1,stepUm:500,count:8,period:4,expires:180,seq:1,isNew:true});
 assert.equal(a.phase,'fast');assert.equal(steps,0);assert.equal(a.count,3);
});

test('the last INT32_MAX counter increment agrees with the firmware and cannot wrap',()=>{
 const {g,input}=rig();g.lastInput.positive=2147483646;
 assert.equal(input({context:2,plus:2147483647,direction:1,period:4}).count,1);
 assert.throws(()=>input({context:2,plus:0,direction:1,period:4}),/counter delta/);
});
