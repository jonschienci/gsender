'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Gate}=require('../pendant/protocol.cjs');
const {TouchJog}=require('../pendant/touch-jog.cjs');
const boot='0123456789abcdef';
function gate(){
    let now=0;const g=new Gate(boot,()=>now,true);
    const alive=()=>`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 2 500`;
    const page=(p=1,epoch=2)=>`P2 PCAP ${boot} ${g.session} ${g.ticket} 1 ${p} ${epoch}`;
    g.state([0,0,0],true,'PAD_READY');g.receive(alive());g.receive(page());
    g.state([0,0,0],true,'PAD_ARMED',true);
    const pad=(seq=1,kind='B',age=0,gesture=1)=>`P2 PAD ${boot} ${g.session} ${seq} ${g.ticket} 2 ${gesture} ${kind} 0 1 ${age} 500`;
    return {g,pad,page,alive,time:t=>now=t};
}
test('bounded long-press has fixed conservative deadline, never a renewable lease',()=>{
    const f=gate();f.time(20);
    const e=f.g.receive(f.pad(1,'B',10));
    assert.equal(e.kind,'B');assert.equal(e.expires,990);assert.equal(e.queueDeadline,100);
    f.time(40);f.g.state([0,0,0],true,'PAD_ARMED',true);
    assert.equal(f.g.receive(f.pad(2)),undefined);
    assert.equal(f.g.receive(f.pad(3,'H')),undefined);
    assert.equal(f.g.receive(f.pad(4,'S')).kind,'S');
    assert.equal(f.g.receive(f.pad(5)),undefined);
    assert.equal(f.g.receive(f.pad(6,'B',0,2)).kind,'B');
});
test('stale receipt/source, disarmed ticket, wrong page and prior session reject bounded motion',()=>{
    for(const cause of ['receipt','source','disarmed','page','session']){
        const f=gate();let line;
        if(cause==='receipt')f.time(100);
        if(cause==='disarmed')f.g.state([0,0,0],true,'PAD_READY',false);
        if(cause==='page')f.g.receive(f.page(2,3));
        line=f.pad(1,'B',cause==='source'?100:0);
        if(cause==='session')assert.throws(()=>f.g.receive(line.replace(f.g.session,'f'.repeat(32))));
        else assert.equal(f.g.receive(line).kind,'S',cause);
    }
});
test('fresh-sample hold cannot convert itself into a longer edge hold',()=>{
    const f=gate();assert.equal(f.g.receive(f.pad(1,'H')).kind,'H');
    assert.throws(()=>f.g.receive(f.pad(2,'B')),/mode/);
});
function motor(){
    let now=0,retired=0,cancels=0;
    const writes=[];const s={xyz:[0,0,0],serial:1,state:'IDLE',empty:true,transportEmpty:true};
    const j=new TouchJog({now:()=>now,canStart:()=>true,snapshot:()=>s,maximum:()=>1000,
        send:line=>writes.push(line),retire:n=>retired+=n,drained:()=>!retired,cancel:()=>cancels++});
    const input=(kind='B',expires=1000)=>j.input({kind,x:0,y:1,gesture:1,expires,queueDeadline:now+100,stepUm:500},{feedrate:600});
    const tick=(t,y=s.xyz[1],state='JOG')=>{now=t;s.xyz[1]=y;s.state=state;s.serial++;j.tick(s);};
    return {j,input,tick,writes,s,time:t=>now=t,cancels:()=>cancels};
}
test('one factory event drives multiple short segments then stops at one second',()=>{
    const f=motor();f.input();f.tick(0,0,'IDLE');
    for(let t=60;t<1000;t+=60){f.j.ack();f.tick(t,t/100);}
    assert.ok(f.writes.length>=10);
    assert.ok(f.writes.every(line=>line==='$J=G21G91 Y0.6000 F600.000'));
    f.j.ack();const count=f.writes.length;f.tick(1000,9.6);
    assert.equal(f.cancels(),1);assert.equal(f.j.phase,'stopping');
    f.tick(1020,9.6);assert.equal(f.writes.length,count);
});
test('received release stops earlier, cancels only once, and cannot leave a queued restart',()=>{
    const f=motor();f.input();f.tick(0,0,'IDLE');f.time(30);f.input('S');f.input('S');
    assert.equal(f.cancels(),1);f.input();f.tick(60);assert.equal(f.writes.length,1);
});
test('bounded hold refuses renewals or forged distant deadlines',()=>{
    const f=motor();f.input('B',100000);assert.equal(f.j.latest.expires,1000);
    f.tick(0,0,'IDLE');f.time(50);f.input('B',100050);
    assert.equal(f.cancels(),1);assert.equal(f.j.latest,null);
});
test('stationary machine ACKs do not free planner space; no ACK sends only one segment',()=>{
    for(const ack of [false,true]){
        const f=motor();f.input();f.tick(0,0,'IDLE');
        if(ack)f.j.ack();f.tick(40);if(ack)f.j.ack();
        f.tick(80);f.tick(120);f.tick(200);
        assert.equal(f.writes.length,ack?2:1);
    }
});
test('busy transport cannot revive a bounded command after its deadline',()=>{
    const f=motor();f.input();f.s.transportEmpty=false;f.tick(100);
    f.s.transportEmpty=true;f.tick(1000);
    assert.deepEqual(f.writes,[]);assert.equal(f.j.phase,'idle');
});
