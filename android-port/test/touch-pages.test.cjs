'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {Gate}=require('../pendant/protocol.cjs');
const {Controller}=require('../pendant/controller.cjs');
const boot='0123456789abcdef',preset={xyStep:.5,zStep:.1,feedrate:600,rapidFeedrate:2000};
function gate(wireless=false){
    let time=0;const g=new Gate(boot,()=>time,wireless);
    const cap=(page=1,epoch=2)=>`P2 PCAP ${boot} ${g.session} ${g.ticket} 1 ${page} ${epoch}`;
    const alive=()=>`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 2 500`;
    g.state([0,0,0],true,'PAD_READY');g.receive(alive());g.receive(cap());
    g.state([0,0,0],true,'PAD_ARMED',true);
    const pad=(seq=1,kind='H',gesture=1,x=1,y=1,age=0,epoch=g.pageEpoch)=>
        `P2 PAD ${boot} ${g.session} ${seq} ${g.ticket} ${epoch} ${gesture} ${kind} ${x} ${y} ${age} 500`;
    return {g,cap,pad,alive,time:n=>time=n};
}
test('page epoch is acknowledged in STATE and all old tickets are revoked on a click',()=>{
    const f=gate();assert.match(f.g.state([0,0,0],true,'PAD_ARMED',true),/PAD_ARMED 500 1 2\n$/);
    assert.equal(f.g.receive(f.pad()).kind,'H');
    assert.deepEqual(f.g.receive(f.cap(2,3)),{type:'page',page:2,epoch:3});
    assert.equal(f.g.receive(f.pad(2,'H',2,1,1,0,2)).kind,'S');
    assert.ok([...f.g.tickets.values()].every(t=>!t.armed));
});
test('all eight pad directions survive validation; center and corrupt vectors are rejected',()=>{
    for(const x of [-1,0,1])for(const y of [-1,0,1]){
        const f=gate();if(!x&&!y)assert.throws(()=>f.g.receive(f.pad(1,'T',1,x,y)));
        else {const e=f.g.receive(f.pad(1,'T',1,x,y));assert.deepEqual([e.x,e.y],[x,y]);}
    }
    const f=gate();assert.throws(()=>f.g.receive(f.pad(1,'T',1,2,0)));
});
test('same tap, stop, duplicate and delayed old-page packets never restart motion',()=>{
    const f=gate();assert.equal(f.g.receive(f.pad(1,'T')).kind,'T');
    assert.equal(f.g.receive(f.pad(1,'T')),undefined);assert.equal(f.g.receive(f.pad(2,'H')),undefined);
    assert.equal(f.g.receive(f.pad(3,'H',2)).kind,'H');assert.equal(f.g.receive(f.pad(4,'S',2)).kind,'S');
    assert.equal(f.g.receive(f.pad(5,'H',2)),undefined);
});
test('source age cannot be reset by repeating an aged hold across host tickets',()=>{
    const f=gate(true);const first=f.g.receive(f.pad(1,'H',1,1,0,100));assert.equal(first.expires,150);
    f.time(40);f.g.state([0,0,0],true,'PAD_ARMED',true);
    const repeated=f.g.receive(f.pad(2,'H',1,1,0,140));assert.equal(repeated.expires,150);
    f.time(100);assert.equal(f.g.receive(f.pad(3,'H',1,1,0,250)).kind,'S');
});
test('99ms host ticket may move; 100ms is discarded and closes the gesture',()=>{
    for(const ms of [99,100]){const f=gate(true);f.time(ms);assert.equal(f.g.receive(f.pad()).kind,ms===99?'H':'S');}
});
test('corrupt session, sequence gaps, in-contact direction changes fail closed',()=>{
    for(const cause of ['session','sequence','direction']){
        const f=gate();f.g.receive(f.pad());
        assert.throws(()=>f.g.receive(cause==='session'?f.pad(2).replace(f.g.session,'f'.repeat(32)):
            cause==='sequence'?f.pad(3):f.pad(2,'H',1,-1,1)));
    }
});
test('new page rejects XY detents; encoder Z remains supported',()=>{
    const f=gate(),line=axis=>`P2 DETENT ${boot} ${f.g.session} 1 ${f.g.ticket} ${axis} 1 500`;
    assert.equal(f.g.receive(line('X')),undefined);
    const next=gate();assert.equal(next.g.receive(`P2 DETENT ${boot} ${next.g.session} 1 ${next.g.ticket} Z -1 500`).axis,'Z');
});
function machine(){
    let time=0,seq=0;const writes=[],commands=[],faults=[];
    const c={type:'GrblHAL',options:{port:'mock'},settings:{settings:{$13:'0',$110:'1000',$111:'1000',$112:'500'}},
        workflow:{state:'idle'},feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},
        connection:new EventEmitter(),runner:new EventEmitter(),isOpen:()=>true,
        command:(...a)=>commands.push(a),writeln:line=>writes.push(line)};
    c.connection.connection={port:{isOpen:true,writableLength:0,writeBounded(){}}};
    c.runner.state={status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
    const m=new Controller(()=>({c}),reason=>{faults.push(reason);m.stop();},()=>time);
    m.sync();c.runner.emit('status');m.owned=true;m.preset=preset;
    const input=(kind='H',x=1,y=0,gesture=1,expiry=time+250)=>m.pad({kind,x,y,gesture,expires:expiry,queueDeadline:time+100,stepUm:500},preset);
    const status=(at,xyz,state='Idle')=>{time=at;if(xyz)c.runner.state.status.mpos={x:xyz[0],y:xyz[1],z:xyz[2]};c.runner.state.status.activeState=state;c.runner.emit('status');};
    return {m,c,writes,commands,faults,input,status,time:n=>time=n,ack:()=>c.runner.emit('ok')};
}
test('tap issues one finite diagonal at Precision feed, not jog:start',()=>{
    const f=machine();f.input('T',-1,1);f.m.tick();
    assert.deepEqual(f.writes,['$J=G21G91 X-0.5000 Y0.5000 F600.000']);
    f.m.tick();assert.equal(f.writes.length,1);f.ack();f.status(60,[-.5,.5,0]);f.m.tick();
    assert.equal(f.m.touch.busy(),false);assert.equal(f.commands.length,0);
});
test('tap blocked by writable backlog expires rather than being sent late',()=>{
    const f=machine();f.input('T');f.c.connection.connection.port.writableLength=1;f.m.tick();
    f.status(101);f.c.connection.connection.port.writableLength=0;f.m.tick();assert.equal(f.writes.length,0);
});
test('hold direction is normalized, capped, and no planner slot is freed by time alone',()=>{
    const f=machine();f.input('H',1,1);f.m.tick();assert.match(f.writes[0],/X0.4242 Y0.4242 F600/);
    f.ack();f.status(40,[0,0,0],'Jog');f.input('H',1,1);f.m.tick();assert.equal(f.writes.length,2);
    f.ack();f.status(80,[0,0,0],'Jog');f.input('H',1,1);f.m.tick();assert.equal(f.writes.length,2);
    f.status(200,[0,0,0],'Jog');f.input('H',1,1);f.m.tick();assert.equal(f.writes.length,2);
});
test('hold release cancels once and needs actual idle + receipts before another input',()=>{
    const f=machine();f.input();f.m.tick();f.input('S');f.input('S');assert.deepEqual(f.commands,[['jog:stop']]);
    f.status(60);f.m.tick();f.status(120);f.m.tick();assert.equal(f.m.touch.phase,'stopping');
    f.ack();f.status(180);f.m.tick();assert.equal(f.m.touch.phase,'idle');
    f.input('T');f.m.tick();assert.equal(f.writes.length,2);
});
test('lost contact stops at its source expiry without extending the last state',()=>{
    const f=machine();f.input('H',1,0,1,120);f.m.tick();f.status(120,[0,0,0],'Jog');f.m.tick();
    assert.deepEqual(f.commands,[['jog:stop']]);f.status(150);f.m.tick();assert.equal(f.writes.length,1);
});
test('Z wheel never combines with held XY and page/disconnect stop clears both paths',()=>{
    const f=machine();f.input();f.m.tick();assert.equal(f.m.submit({axis:'Z',direction:1,stepUm:500},preset),false);
    f.m.stop();assert.equal(f.m.queue.length,0);assert.equal(f.m.touch.busy(),false);
    assert.deepEqual(f.commands,[['jog:stop']]);assert.equal(f.m.canArm(),false);
});
test('fault during write or uncertain cancellation does not lose outstanding motion receipts',()=>{
    const f=machine();f.input();f.m.tick();f.c.command=()=>{throw Error('failed cancel');};
    f.m.stop();assert.equal(f.m.cancelFailed,true);assert.equal(f.m.cancelPending,1);assert.equal(f.m.canArm(),false);
});
test('no touch jog before armed, while rotary, stale CNC, or outside confirmed path',()=>{
    const f=machine();f.m.owned=false;f.input();f.m.tick();assert.equal(f.writes.length,0);
    f.m.owned=true;f.c.isInRotaryMode=true;f.input();assert.throws(()=>f.m.tick());assert.equal(f.writes.length,0);
    f.c.isInRotaryMode=false;f.input();f.m.tick();f.status(50,[0,0,.1],'Jog');assert.throws(()=>f.m.tick(),/path/);
});
test('late tap endpoint faults without retry; stop cancels finite move',()=>{
    const f=machine();f.input('T');f.m.tick();f.status(1600);assert.throws(()=>f.m.tick(),/endpoint/);f.m.stop();
    assert.equal(f.writes.length,1);assert.deepEqual(f.commands,[['jog:stop']]);
});
