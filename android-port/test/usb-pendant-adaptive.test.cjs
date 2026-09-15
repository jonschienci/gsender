'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {Controller}=require('../pendant/controller.cjs'),{Gate}=require('../pendant/protocol.cjs');
const preset={xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000},boot='0123456789abcdef';
function rig(){
    let now=0,seq=0;const writes=[],commands=[];
    const c={type:'GrblHAL',options:{port:'mock'},isOpen:()=>true,settings:{settings:{$13:'0',$110:2000,$111:2000,$112:500,$120:100,$121:100,$122:100}},
        workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},connection:new EventEmitter(),runner:new EventEmitter(),
        command:cmd=>commands.push(cmd),writeln:(line,context)=>writes.push({line,context,at:now})};
    c.connection.connection={port:{isOpen:true,writableLength:0,writeBounded(){}}};
    c.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
    const m=new Controller(()=>({c}),()=>{},()=>now);m.sync();m.mode='adaptive';m.preset=preset;m.owned=true;
    const status=(state='Idle',position=c.runner.state.status.mpos)=>{c.runner.state.status={activeState:state,mpos:position};c.runner.emit('status');};status();
    const wheel=(time,period=80,axis='X',direction=1,stepUm=500)=>{now=time;status(c.runner.state.status.activeState);m.wheel({seq:++seq,isNew:true,axis,direction,period,age:0,expires:now+180,stepUm},preset);m.tick();};
    const ack=()=>c.runner.emit('ok',{raw:'ok'});
    const tick=time=>{now=time;status(c.runner.state.status.activeState);m.tick();};
    const completeStep=()=>{ack();status('Idle',Object.fromEntries(['x','y','z'].map((k,i)=>[k,m.active.target[i]])));m.tick();};
    const fast=()=>{wheel(0,0);completeStep();wheel(80);completeStep();wheel(160);};
    return {c,m,writes,commands,status,wheel,ack,tick,completeStep,fast,time:t=>{now=t;}};
}
test('isolated slow detents retain exact STEP, including a long step after release',()=>{
    const r=rig();r.wheel(0,0,'X',1,4100);assert.match(r.writes[0].line,/X4\.1000 F1000/);
    r.m.wheel({direction:0,isNew:false},preset);r.tick(300);
    assert.deepEqual(r.commands,[]);assert.equal(r.m.adaptive.phase,'step');assert.equal(r.writes.length,1);
    r.completeStep();r.wheel(600,600,'Y',-1,4100);assert.match(r.writes[1].line,/Y-4\.1000 F1000/);
});
test('three sustained fast detents switch from exact steps to variable-speed short segments',()=>{
    const r=rig();r.fast();assert.equal(r.m.adaptive.phase,'fast');assert.equal(r.writes.length,3);
    assert.match(r.writes[0].line,/X0\.5000 F1000/);
    assert.match(r.writes[2].line,/X1\.1200 F1120/);
    r.ack();r.wheel(200,40);assert.match(r.writes.at(-1).line,/X1\.2000 F1200/);
    assert.ok(r.writes.every(w=>w.context.usbPendant===true));
});
test('ACK, real progress, three-segment cap and 120ms nominal budget prevent accumulation',()=>{
    const r=rig();r.fast();for(let i=161;i<200;i++)r.tick(i);assert.equal(r.writes.length,3);
    r.ack();r.wheel(200,40);r.ack();
    for(let i=210;i<=500;i+=20){r.wheel(i,20);r.ack();}
    assert.equal(r.writes.length,4);assert.equal(r.m.adaptive.segments.length,2);
    assert.ok(r.m.adaptive.segments.length<=3);
    const first=r.m.adaptive.segments[0].target;
    r.status('Jog',{x:first[0],y:0,z:0});r.wheel(520,20);assert.equal(r.writes.length,5);
});
test('letting go cancels once and never replays a pending fast burst',()=>{
    const r=rig();r.fast();r.ack();r.tick(340);
    assert.deepEqual(r.commands,['jog:stop']);assert.equal(r.m.adaptive.phase,'stopping');
    r.tick(400);r.tick(460);assert.equal(r.m.adaptive.phase,'step');
    for(let i=500;i<900;i+=50)r.tick(i);
    assert.equal(r.writes.length,3);assert.deepEqual(r.commands,['jog:stop']);
});
test('reversal cancels old direction and waits for fresh Idle and new input',()=>{
    const r=rig();r.fast();r.ack();r.wheel(200,40,'X',-1);
    assert.deepEqual(r.commands,['jog:stop']);r.wheel(230,30,'X',-1);assert.equal(r.writes.length,3);
    r.tick(260);r.tick(320);assert.equal(r.m.adaptive.phase,'step');
    r.wheel(330,100,'X',-1);assert.match(r.writes.at(-1).line,/X-0\.5000 F1000/);
});
test('same-direction STEP hands off without a cancel and bounds all additional travel',()=>{
    const r=rig();r.wheel(0,0,'X',1,10000);r.ack();r.wheel(80,80,'X',1,10000);r.wheel(160,80,'X',1,10000);
    assert.equal(r.writes.length,1);assert.deepEqual(r.commands,[]);assert.equal(r.m.queue.length,0);
    assert.equal(r.m.active,null);assert.equal(r.m.adaptive.segments.length,1);
    r.wheel(220,60,'X',1,10000);r.wheel(280,60,'X',1,10000);
    assert.equal(r.m.adaptive.phase,'fast');assert.equal(r.writes.length,1,'Cannot append behind a long outstanding STEP');
    r.status('Jog',{x:9.2,y:0,z:0});r.wheel(300,20,'X',1,10000);
    assert.equal(r.writes.length,2);assert.deepEqual(r.commands,[]);
    r.ack();r.tick(480);assert.deepEqual(r.commands,['jog:stop'],'Release still cancels transferred motion');
});
test('same-timestamp USB/UART burst cannot manufacture fast mode',()=>{
    const r=rig();for(let i=0;i<50;i++)r.wheel(0,0);
    assert.equal(r.m.adaptive.phase,'step');assert.equal(r.writes.length,1);assert.ok(r.m.queue.length<=8);
});
test('reversal with queued slow steps never replays the turn that starts cancellation',()=>{
    const r=rig();
    r.wheel(0,0,'X',1,10000);r.ack();
    r.wheel(80,80,'X',1,10000);
    r.wheel(160,80,'X',-1,10000);
    assert.equal(r.m.adaptive.phase,'stopping');
    assert.equal(r.m.queue.length,0,'Cancellation must discard the triggering turn');
    r.tick(220);r.tick(280);r.tick(290);
    assert.equal(r.writes.length,1,'No new movement after cancellation without a fresh turn');
    r.wheel(300,140,'X',-1,10000);
    assert.match(r.writes.at(-1).line,/X-10\.0000 F1000/);
});
test('axis selection and STEP editing stop adaptive motion without queuing a new axis',()=>{
    const r=rig();r.fast();r.ack();r.m.clearQueue();assert.deepEqual(r.commands,['jog:stop']);
    assert.equal(r.m.adaptive.phase,'stopping');assert.equal(r.writes.length,3);
});
test('loss of motion ACK, stopped telemetry and off-path movement fail closed',()=>{
    const r=rig();r.fast();r.wheel(300,100);r.wheel(450,100);
    assert.throws(()=>r.wheel(561,100),/ACK timeout/);r.m.stop();assert.deepEqual(r.commands,['jog:stop']);
    const x=rig();x.fast();x.status('Jog',{x:50,y:0,z:0});assert.throws(()=>x.m.tick(),/confirmed path/);
    const y=rig();y.fast();y.time(1000);assert.throws(()=>y.m.tick(),/permits jogging/);
});
test('feed is capped by Rapid AND the selected axis, even below Precision',()=>{
    const r=rig();r.c.settings.settings.$110=100;r.fast();r.ack();
    assert.match(r.writes.at(-1).line,/F100\.000/);
    for(let i=0;i<6;i++){
        const last=r.m.adaptive.segments.at(-1);r.ack();r.status('Jog',{x:last.target[0],y:0,z:0});r.wheel(240+i*80,80);
    }
    assert.ok(r.writes.slice(2).every(w=>Number(/F([\d.]+)/.exec(w.line)[1])<=100));
    const last=r.m.adaptive.segments.at(-1);r.ack();r.status('Jog',{x:last.target[0],y:0,z:0});r.wheel(800,170);
    assert.ok(Number(/F([\d.]+)/.exec(r.writes.at(-1).line)[1])<=100);
});
test('cancel uncertainty and outstanding receipts cannot be re-armed',()=>{
    const r=rig();r.fast();r.m.stop();r.time(400);r.status();assert.equal(r.m.canArm(),false);
    r.ack();assert.equal(r.m.canArm(),true);
    const x=rig();x.fast();x.c.command=()=>{throw Error('transport failed');};
    assert.doesNotThrow(()=>x.m.stop());x.time(400);x.status();x.ack();assert.equal(x.m.canArm(),false);
});
test('fast feed never exceeds an axis limit below one mm per minute',()=>{
    const r=rig();r.c.settings.settings.$110=.5004;r.fast();
    const feed=Number(/F([\d.]+)/.exec(r.writes.at(-1).line)[1]);
    assert.ok(feed>0 && feed<=.5004);assert.equal(feed,.5);
    const origin=r.c.runner.state.status.mpos.x;
    for(let time=200;time<=500;time+=40){r.ack();r.wheel(time,40);}
    assert.equal(r.c.runner.state.status.mpos.x,origin);
    assert.equal(r.writes.length,4,'Even tiny segments must confirm actual progress before freeing capacity');
});
test('reattaching the knob observer cannot clear uncertain CNC cancellation',()=>{
    const r=rig();r.fast();r.c.command=()=>{throw Error('transport failed');};
    // The controller captured its command entry point when it attached.
    r.m.original=r.c.command;
    r.m.stop();assert.equal(r.m.cancelFailed,true);
    r.m.detach();r.m.sync();r.time(400);r.status();r.ack();
    assert.equal(r.m.canArm(),false,'Same CNC USB session must retain cancellation failure');
    r.m.detach();r.c.connection.connection.port={isOpen:true,writableLength:0,writeBounded(){}};
    r.m.sync();r.time(500);r.status();assert.equal(r.m.canArm(),true,'New board transport starts a new receipt history');
});
function gate(){let now=0;const g=new Gate(boot,()=>now);const state=()=>{g.state([0,0,0],true,'VEL_ARMED',true);g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`);g.receive(`P2 VCAP ${boot} ${g.session} ${g.ticket} 1`);};state();state();
    return {g,time:t=>{now=t;},state,line:(seq,period,age=0)=>`P2 WHEEL ${boot} ${g.session} ${seq} ${g.ticket} X 1 ${period} ${age} 500`};}
test('source period survives USB batching; duplicate samples cannot renew turn deadline',()=>{
    const r=gate(),e=r.g.receive(r.line(1,80));assert.equal(e.period,80);assert.equal(e.expires,180);
    r.time(40);r.state();const repeat=r.g.receive(r.line(1,80,40));assert.equal(repeat.isNew,false);assert.equal(repeat.expires,180);
    r.time(80);r.state();assert.throws(()=>r.g.receive(r.line(1,80,20)),/repeated/);
});
test('zero-period events interleaved with real timing do not reset fast qualification',()=>{
    const r=rig();r.wheel(0,0);r.completeStep();r.wheel(80,80);r.completeStep();
    for(let i=0;i<20;i++)r.wheel(80,0);
    assert.equal(r.m.adaptive.phase,'step','Zero intervals alone cannot establish speed');
    r.wheel(160,80);assert.equal(r.m.adaptive.phase,'fast');
    assert.equal(r.m.adaptive.period,80);assert.deepEqual(r.commands,[]);
    const measured=r.m.adaptive.period;
    for(let i=0;i<100;i++)r.wheel(160,0);
    assert.equal(r.m.adaptive.period,measured,'Zero interval cannot be treated as either stop or infinite speed');
    assert.equal(r.m.queue.length,0);
});
test('very fast sustained turns ramp to saved Rapid then slow smoothly toward Precision',()=>{
    const r=rig();r.c.settings.settings.$110=8000;r.fast();
    for(let t=180;t<=1500;t+=20){
        r.ack();const last=r.m.adaptive.segments.at(-1);
        if(last)r.status('Jog',{x:last.target[0],y:0,z:0});
        r.wheel(t,(t/20)%2?10:0);
        assert.equal(r.m.adaptive.phase,'fast');assert.equal(r.m.queue.length,0);
    }
    const feeds=r.writes.slice(2).map(w=>Number(/F([\d.]+)/.exec(w.line)[1]));
    assert.ok(feeds.some(f=>f>1000));assert.equal(feeds.at(-1),5000);
    assert.ok(feeds.every(f=>f<=5000));assert.deepEqual(r.commands,[]);
    for(let t=1660;t<=3740;t+=160){
        r.ack();const last=r.m.adaptive.segments.at(-1);
        if(last)r.status('Jog',{x:last.target[0],y:0,z:0});
        r.wheel(t,160);
    }
    assert.equal(Number(/F([\d.]+)/.exec(r.writes.at(-1).line)[1]),1000);
    r.ack();const end=r.writes.at(-1).at;r.tick(end+180);
    assert.deepEqual(r.commands,['jog:stop']);
    r.status('Idle');r.tick(end+240);r.tick(end+300);
    const count=r.writes.length;r.tick(end+400);assert.equal(r.writes.length,count);
});
test('same-direction handoff retains an outstanding STEP ACK without resending',()=>{
    const r=rig();r.wheel(0,0);r.wheel(60,60);r.wheel(120,60);
    assert.equal(r.m.active,null);assert.equal(r.m.adaptive.phase,'fast');
    assert.equal(r.m.adaptive.segments[0].acked,false);assert.equal(r.writes.length,1);
    r.wheel(150,30);assert.equal(r.writes.length,1);
    r.ack();r.wheel(180,30);assert.equal(r.writes.length,2);
    assert.equal(r.writes.filter(w=>w.line==='$J=G21G91 X0.5000 F1000.000').length,1);
});
test('handoff validation failure retains issued motion for cancellation and receipt tracking',()=>{
    const r=rig();r.wheel(0,0);r.wheel(60,60);
    r.m.adaptive.io.limits=()=>{throw Error('Axis settings unavailable');};
    assert.throws(()=>r.wheel(120,60),/Axis settings unavailable/);
    r.m.stop();
    assert.deepEqual(r.commands,['jog:stop'],'Validation failure must still cancel the inherited STEP');
    assert.equal(r.m.cancelPending,1,'The outstanding receipt must remain tracked');
    assert.equal(r.writes.length,1,'Never resend the inherited STEP');
});
test('opposite active STEP cannot be inherited by a new fast direction',()=>{
    const r=rig();r.wheel(0,0,'X',1,10000);r.ack();
    r.wheel(300,300,'X',-1,10000);r.wheel(360,60,'X',-1,10000);r.wheel(420,60,'X',-1,10000);
    assert.deepEqual(r.commands,['jog:stop']);assert.equal(r.m.adaptive.phase,'stopping');
    assert.equal(r.m.queue.length,0);assert.equal(r.writes.length,1);
});
test('old packets, changed STEP, zero and revoked tickets cannot request velocity',()=>{
    for(const change of [r=>r.time(100),r=>r.g.revoke(),r=>r.g.stepUm=0,r=>r.g.selection=3]){
        const r=gate();change(r);assert.equal(r.g.receive(r.line(1,20)).direction,0);
    }
});
test('wrong session, gap, corrupt period and bad capability fail closed',()=>{
    for(const change of [s=>s.replace(' 1 2 X',' 4 2 X'),s=>s.replace(' 80 0 ',' NaN 0 '),s=>s.replace(boot,'a'.repeat(16))]){
        const r=gate();assert.throws(()=>r.g.receive(change(r.line(1,80))));
    }
    const r=gate();assert.throws(()=>r.g.receive(`P2 VCAP ${boot} ${r.g.session} 2 9`));
});
