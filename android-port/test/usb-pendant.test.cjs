'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { Gate, Lines, hello, precision, jog } = require('../pendant/protocol.cjs');
const { Controller } = require('../pendant/controller.cjs');
const { Pendant } = require('../pendant/service.cjs');
const boot = '0123456789abcdef', preset = { xyStep: .5, zStep: .1, feedrate: 1000, rapidFeedrate: 5000 };
function wire(now) {
    const g = new Gate(boot, now);
    const alive = () => `P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`;
    const detent = (seq = 1, ticket = g.ticket, axis = 'X', direction = 1) => `P2 DETENT ${boot} ${g.session} ${seq} ${ticket} ${axis} ${direction} 500`;
    g.state([0,0,0], true, 'IDLE'); g.receive(alive());
    g.state([0,0,0], true, 'IDLE', true);
    return { g, alive, detent };
}
test('P2 handshake rejects bench, faults and malformed protocol', () => {
    assert.equal(hello(`P2 HELLO ${boot} 2 1 0`), boot);
    for (const s of [`B1 BENCH ${boot} ready=1 fault=0 NO_CNC`, `P2 HELLO ${boot} 2 1 1`, `P2 HELLO ${boot} 1 1 0`]) assert.throws(() => hello(s));
});
test('fragmented lines preserve exact bytes; corrupt and oversized input fail', () => {
    const l = new Lines(); assert.deepEqual(l.feed(Buffer.from('P2 HE')), []);
    assert.deepEqual(l.feed(Buffer.from('LLO\r\nP2 NEXT\n')), ['P2 HELLO','P2 NEXT']);
    assert.throws(() => l.feed(Buffer.from([255])));
    assert.throws(() => new Lines().feed(Buffer.from('a'.repeat(257))));
});
test('state uses integer micrometres, all XYZ and never arms before ready', () => {
    const g = new Gate(boot, () => 0);
    assert.match(g.state([-12.345,2,0],true,'IDLE',true), / 1 1 0 -12345 2000 0 IDLE 500\n$/);
    assert.match(g.state([NaN,0,0],true,'ALARM:1',true), / 2 0 0 0 0 0 ALARM__ 500\n$/);
});
test('one detent once; duplicates cannot repeat motion', () => {
    const { g, detent } = wire(() => 0);
    assert.deepEqual(g.receive(detent()), { axis:'X',direction:1,stepUm:500 });
    assert.equal(g.receive(detent()), undefined);
    assert.deepEqual(g.receive(detent(2,g.ticket,'Z',-1)), { axis:'Z',direction:-1,stepUm:500 });
});
test('old, unissued, wrong-session, skipped and invalid detents fail closed', () => {
    for (const kind of ['unissued','session','skip','axis','direction','reboot']) {
        let time = 0; const { g, detent } = wire(() => time);
        let line = detent();
        if (kind === 'old') time = 500;
        if (kind === 'unissued') line = detent(1,999);
        if (kind === 'session') line = line.replace(g.session,'0'.repeat(32));
        if (kind === 'skip') line = detent(2);
        if (kind === 'axis') line = detent(1,g.ticket,'A');
        if (kind === 'direction') line = detent(1,g.ticket,'X',2);
        if (kind === 'reboot') line = `P2 HELLO ${'f'.repeat(16)} 1 1 0`;
        assert.throws(() => g.receive(line), undefined, kind);
    }
});
test('disarming revokes even already-issued tickets', () => {
    const {g,detent} = wire(() => 0); g.revoke(); assert.equal(g.receive(detent()),undefined); assert.equal(g.dropped,1);
});
test('Precision is bounded and generates only finite G21 G91 $J commands', () => {
    assert.equal(jog(precision(preset),'X',1),'$J=G21G91 X0.5000 F1000.000');
    assert.equal(jog(preset,'Z',-1),'$J=G21G91 Z-0.1000 F1000.000');
    for (const p of [{...preset,xyStep:100},{...preset,feedrate:1001},{...preset,feedrate:0},{...preset,zStep:NaN},{...preset,xyStep:'0.5'}]) assert.throws(() => precision(p));
});
function fakeCnc() {
    const writes = [], commands = [], c = { type:'GrblHAL', options:{port:'android-usb:42:0'}, open:true,
        settings:{settings:{'$13':'0'}}, workflow:{state:'idle'},
        feeder:{toJSON:()=>({hold:false,pending:false,queue:0})}, connection:new EventEmitter(), runner:new EventEmitter(),
        isOpen(){return this.open;}, command(cmd,...args){ commands.push([cmd,...args]); },
        writeln(line,context,emit){ writes.push({line,context,emit}); }
    };
    c.runner.state = {status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
    c.connection.connection = { port: { isOpen: true, writableLength: 0, writeBounded() {} } };
    return { c,writes,commands,status:() => c.runner.emit('status',c.runner.state.status) };
}
function machine() {
    let time=0; const f=fakeCnc(), faults=[];
    const m=new Controller(()=>({cnc:f.c}),reason=>{faults.push(reason);m.stop();},()=>time);
    m.sync(); f.status(); m.owned=true;
    return {...f,m,faults,time:n=>{time=n;}};
}
test('controller observes fresh reports even while coordinates are unchanged', () => {
    const f=machine(); f.time(700); f.status(); f.time(1000);
    assert.equal(f.m.canArm(),true); f.time(1500); assert.equal(f.m.canArm(),false);
});
test('report inches convert to mm; unknown $13 refuses arming', () => {
    const f=machine(); f.c.settings.settings.$13='1'; f.c.runner.state.status.mpos.x=1;
    assert.equal(f.m.snapshot().xyz[0],25.4);
    delete f.c.settings.settings.$13; assert.equal(f.m.canArm(),false);
});
test('one in-flight increment; waits for ok AND a fresh idle endpoint', () => {
    const f=machine(); f.m.submit({axis:'X',direction:1},preset); f.m.tick(); f.m.submit({axis:'Z',direction:-1},preset);
    assert.equal(f.writes.length,1); f.m.tick(); assert.equal(f.writes.length,1);
    f.c.runner.emit('ok'); f.status(); f.m.tick(); assert.equal(f.writes.length,1);
    f.c.runner.state.status.mpos.x=.5; f.status(); f.m.tick();
    assert.equal(f.writes.length,2); assert.equal(f.writes[1].line,'$J=G21G91 Z-0.1000 F1000.000');
    assert.equal(f.commands.some(c=>c[0]==='jog:start'),false);
});
test('a detent retains its selected axis; stale queue is discarded', () => {
    const f=machine(); f.m.submit({axis:'Y',direction:1},preset); f.time(501); f.status(); f.m.tick();
    assert.equal(f.writes.length,0); assert.equal(f.m.queue.length,0);
});
test('completion timeout does not retry, cancellation clears pending turns', () => {
    const f=machine(); f.m.submit({axis:'X',direction:1},preset); f.m.tick();
    f.m.submit({axis:'X',direction:1},preset); f.time(1531); f.status();
    assert.throws(()=>f.m.tick(),/endpoint/); f.m.stop(); f.m.tick();
    assert.equal(f.writes.length,1); assert.deepEqual(f.commands,[['jog:stop']]); assert.equal(f.m.queue.length,0);
});
test('busy/rotary/unknown machine state cannot arm', () => {
    for (const change of [f=>f.c.workflow.state='running',f=>f.c.runner.state.status.activeState='Jog',f=>f.c.isInRotaryMode=true,f=>f.c.feeder.toJSON=()=>({hold:true,pending:false,queue:0}),f=>f.c.runner.state.status.mpos.x=null]) {
        const f=machine(); change(f); assert.equal(f.m.canArm(),false);
    }
});
test('other gSender command cancels owned move first; does not commandeer CNC port', () => {
    const f=machine(); f.m.submit({axis:'X',direction:1},preset); f.m.tick(); f.c.command('gcode:start');
    assert.deepEqual(f.commands,[['jog:stop'],['gcode:start']]); assert.equal(f.m.owned,false);
    const original=f.m.original; f.m.detach(); assert.equal(f.c.command,original); assert.equal(f.c.open,true);
});
test('alarm/reboot/disconnect revoke owned motion', () => {
    for (const event of ['alarm','startup','error']) {
        const f=machine(); f.m.submit({axis:'X',direction:1},preset); f.m.tick(); f.c.runner.emit(event,{});
        assert.equal(f.m.owned,false); assert.equal(f.writes.length,1); assert.deepEqual(f.commands,[['jog:stop']]);
    }
});
test('queue is strictly bounded', () => {
    const f=machine(); for(let i=0;i<8;i++) f.m.submit({axis:'X',direction:1},preset);
    assert.equal(f.m.submit({axis:'X',direction:1},preset),false);
    assert.equal(f.m.queue.length,8); assert.equal(f.m.owned,true); assert.equal(f.m.dropped,1);
});
test('CNC transport backlog delays only local detents, which expire instead of becoming late writes', () => {
    const f=machine();f.m.submit({axis:'X',direction:1},preset);
    f.c.connection.connection.port.writableLength=1;f.m.tick();assert.equal(f.writes.length,0);
    f.time(501);f.status();f.c.connection.connection.port.writableLength=0;f.m.tick();assert.equal(f.writes.length,0);
});
function fixture() {
    let time=0; const f=fakeCnc(), ports=[], opens=[];
    class Port extends EventEmitter {
        static inventory=[{path:'android-usb:55:0',vendorId:'303a',productId:'1001',serialNumber:'ACEB'},
            {path:'android-usb:42:0',vendorId:'0483',productId:'5740'},
            {path:'android-usb:56:0',vendorId:'1a86',productId:'55d3'}];
        static async list(){ return this.inventory; }
        constructor(o){super();this.path=o.path;this.options=o;this.writes=[];ports.push(this);}
        open(cb){this.isOpen=true;opens.push(this.path);cb();}
        write(data,cb){this.writes.push(data.toString());if(!this.stall)cb();}
        destroy(){this.destroyed=true;this.isOpen=false;this.emit('close');}
    }
    const s=new Pendant({SerialPort:Port,getControllers:()=>({cnc:f.c}),now:()=>time});
    async function ready() {
        await s.connect(); const p=ports.at(-1);
        p.emit('data',Buffer.from(`ROM boot\nP2 HELLO ${boot} 2 1 0\n`)); s.tick(); f.status();
        const g=s.gate;
        p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500\n`));
        return p;
    }
    return {...f,s,ports,opens,Port,ready,time:n=>{time=n;},body:{session:'a'.repeat(32),visible:true,preset}};
}
test('USB connect selects only native ESP, DTR/RTS low, no CNC open or startup move', async () => {
    const f=fixture(); await f.ready(); assert.deepEqual(f.opens,['android-usb:55:0']);
    assert.equal(f.ports[0].options.dtr,false); assert.equal(f.ports[0].options.rts,false);
    assert.equal(f.writes.length,0); assert.equal(f.s.armed,false); assert.equal(f.s.gate.healthy(),true);
});
test('missing/ambiguous ESP never opens a device', async () => {
    for (const list of [[],[0,1].map(i=>({path:String(i),vendorId:'303a',productId:'1001'}))]) {
        const f=fixture();f.Port.inventory=list;await assert.rejects(f.s.connect());assert.deepEqual(f.opens,[]);
    }
});
test('bench firmware is rejected, not silently armed', async () => {
    const f=fixture();await f.s.connect();f.ports[0].emit('data',Buffer.from(`B1 BENCH ${boot} ready=1 fault=0 NO_CNC\n`));
    assert.equal(f.s.port,null);assert.match(f.s.reason,/BENCH/);assert.equal(f.writes.length,0);
});
test('explicit arm followed by one detent moves once through owned controller', async () => {
    const f=fixture(),p=await f.ready(); f.s.arm(f.body); f.time(100); f.s.tick();
    const g=f.s.gate, line=`P2 DETENT ${boot} ${g.session} 1 ${g.ticket} X 1 500\n`;
    p.emit('data',Buffer.from(line+line));f.s.tick();assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].line,'$J=G21G91 X0.5000 F1000.000');
});
test('USB detach cancels once, drops queue, never reconnects or rearms', async () => {
    const f=fixture(),p=await f.ready(); f.s.arm(f.body); f.s.machine.submit({axis:'X',direction:1},preset);f.s.tick();
    p.destroy();f.time(1000);f.s.tick();assert.equal(f.s.armed,false);assert.equal(f.s.port,null);
    assert.equal(f.opens.length,1);assert.equal(f.commands.filter(x=>x[0]==='jog:stop').length,1);
});
test('stale CNC data disarms even if USB is alive', async () => {
    const f=fixture();await f.ready();f.s.arm(f.body);f.time(751);f.s.gate.aliveAt=751;f.s.tick();
    assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
});
test('hidden UI, changed preset or expired UI lease disarm without auto-rearm', async () => {
    for(const mode of ['hidden','preset','expired']) {
        const f=fixture();await f.ready();f.s.arm(f.body);
        if(mode==='hidden')f.s.ui({...f.body,visible:false});
        if(mode==='preset')f.s.ui({...f.body,preset:{...preset,xyStep:.1}});
        if(mode==='expired'){f.time(1501);f.status();f.s.gate.aliveAt=1501;f.s.tick();}
        assert.equal(f.s.armed,false);f.s.ui(f.body);assert.equal(f.s.armed,false);
    }
});
test('serial writes never accumulate behind a stalled USB write', async () => {
    const f=fixture(),p=await f.ready();p.stall=true;f.time(100);f.s.tick();const count=p.writes.length;
    for(const t of [200,300,351]){f.time(t);f.s.tick();}
    assert.equal(p.writes.length,count);assert.equal(f.s.port,null);assert.match(f.s.reason,/stalled/);
});
test('incomplete/invalid arming checks never leave a pending arm request', async () => {
    const f=fixture();assert.throws(()=>f.s.arm(f.body));await f.ready();assert.equal(f.s.armed,false);
});
test('saved Precision preset is shown before arming, without moving', async () => {
    const f=fixture();await f.ready();f.s.ui(f.body);
    assert.deepEqual(f.s.status().preset,preset);assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
});

test('1000 fast turns retain a healthy armed USB link, bounded queue and no late replay', async () => {
    const f=fixture(),p=await f.ready();f.s.arm(f.body);f.time(100);f.s.tick();
    const g=f.s.gate;
    const burst=Array.from({length:1000},(_,i)=>`P2 DETENT ${boot} ${g.session} ${i+1} ${g.ticket} X 1 500\n`).join('');
    p.emit('data',Buffer.from(burst));
    assert.equal(f.s.port,p);assert.equal(f.s.armed,true);assert.equal(f.s.machine.queue.length,8);
    assert.equal(f.s.status().droppedTurns,992);
    f.s.tick();assert.equal(f.writes.length,1);
    f.time(301);f.status();f.c.runner.emit('ok');f.c.runner.state.status.mpos.x=.5;f.status();f.s.tick();
    assert.equal(f.writes.length,1);assert.equal(f.s.machine.queue.length,0);assert.equal(f.s.armed,true);
});
test('late and revoked detents are discarded without renewing the USB lease', () => {
    let now=0;const {g,detent}=wire(()=>now);now=501;
    assert.equal(g.receive(detent()),undefined);assert.equal(g.sequence,1);assert.equal(g.healthy(),false);
    g.state([0,0,0],true,'DISARMED');
    g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`);
    g.state([0,0,0],true,'IDLE',true);
    assert.deepEqual(g.receive(detent(2)),{axis:'X',direction:1,stepUm:500});
});
test('STEP selection/zero/distance mismatch cannot move; changed step needs a new ticket', () => {
    const {g,detent}=wire(()=>0);
    g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 3 10000`);
    assert.equal(g.receive(detent()),undefined);
    g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 10000`);
    assert.equal(g.receive(detent(2).replace(/500$/,'10000')),undefined);
    g.state([0,0,0],true,'IDLE',true);
    assert.deepEqual(g.receive(detent(3).replace(/500$/,'10000')),{axis:'X',direction:1,stepUm:10000});
    g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 0`);g.state([0,0,0],true,'IDLE',true);
    assert.equal(g.receive(detent(4).replace(/500$/,'0')),undefined);
    for(const step of ['-100','10001','550','NaN'])assert.throws(()=>g.receive(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 3 ${step}`));
});
test('zero never writes and 10mm uses the captured setting and Precision feed', () => {
    const f=machine(),p={...preset,feedrate:60};
    f.m.submit({axis:'X',direction:1,stepUm:0},p);f.m.tick();assert.equal(f.writes.length,0);
    f.m.submit({axis:'Z',direction:-1,stepUm:10000},p);p.feedrate=1000;f.m.tick();
    assert.equal(f.writes[0].line,'$J=G21G91 Z-10.0000 F60.000');
    f.time(2000);f.c.runner.state.status.activeState='Jog';f.status();f.m.tick();
    assert.equal(f.m.owned,true);assert.equal(f.m.active.timeout,11500);
    f.time(11500);f.status();assert.throws(()=>f.m.tick(),/endpoint/);f.m.stop();
    assert.deepEqual(f.commands,[['jog:stop']]);assert.equal(f.writes.length,1);
});
test('editing/selecting discards pending moves without issuing a jog or disarming', async () => {
    const f=fixture(),p=await f.ready();f.s.arm(f.body);f.s.machine.submit({axis:'X',direction:1,stepUm:500},preset);
    const g=f.s.gate;p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 3 700\n`));
    assert.equal(f.s.machine.queue.length,0);assert.equal(f.s.armed,true);assert.equal(f.s.status().stepMm,.7);
    f.s.tick();assert.equal(f.writes.length,0);
});
test('real ESP faults still disconnect and never auto-rearm', async () => {
    const f=fixture(),p=await f.ready();f.s.arm(f.body);const g=f.s.gate;
    p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 0 1 0 500\n`));
    assert.equal(f.s.port,null);assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
});

test('adaptive mode never arms old firmware or unknown axis limits',async()=>{
    const f=fixture(),p=await f.ready();f.s.setMode('adaptive');f.s.tick();
    assert.equal(f.s.armed,false);assert.throws(()=>f.s.arm(f.body),/firmware/);
    const g=f.s.gate;p.emit('data',Buffer.from(`P2 VCAP ${boot} ${g.session} ${g.ticket} 1\n`));
    assert.throws(()=>f.s.arm(f.body),/maximum feed/);assert.equal(f.writes.length,0);
});
test('mode changes disarm and require a new capability handshake without moving',async()=>{
    const f=fixture(),p=await f.ready();f.s.arm(f.body);f.s.setMode('adaptive');
    assert.equal(f.s.armed,false);assert.equal(f.s.status().mode,'adaptive');assert.equal(f.writes.length,0);
    f.s.tick();const g=f.s.gate;
    Object.assign(f.c.settings.settings,{$110:2000,$111:2000,$112:500,$120:100,$121:100,$122:100});
    p.emit('data',Buffer.from(`P2 VCAP ${boot} ${g.session} ${g.ticket} 1\n`));f.s.arm(f.body);
    assert.equal(f.s.armed,true);f.s.setMode('step');assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
    assert.throws(()=>f.s.setMode('continuous-unbounded'),/Unknown/);
});
test('background parser and synthetic replies do not release the next motion',()=>{
    const f=machine();f.m.submit({axis:'X',direction:1},preset);f.m.tick();
    f.c.actionMask={queryParserState:{reply:true}};
    f.c.runner.emit('ok',{raw:'ok'});assert.equal(f.m.active.acked,false);
    f.c.actionMask.queryParserState.reply=false;f.c.runner.emit('ok',{raw:'force ok'});assert.equal(f.m.active.acked,false);
    f.c.runner.emit('ok',{raw:'ok'});assert.equal(f.m.active.acked,true);
});
test('Rapid is separate from Precision, bounded, captured and never silently changed while armed',async()=>{
    for(const rapidFeedrate of [null,0,-1,NaN,Infinity,100001,'5000'])assert.throws(()=>precision({...preset,rapidFeedrate}),/Rapid/);
    assert.equal(jog({...preset,rapidFeedrate:9000},'X',1),'$J=G21G91 X0.5000 F1000.000');
    const f=fixture();await f.ready();f.s.arm(f.body);
    f.s.ui({...f.body,preset:{...preset,rapidFeedrate:8000}});
    assert.equal(f.s.armed,false);f.s.ui(f.body);assert.equal(f.s.armed,false);
});
test('old UI without saved Rapid can use Step but cannot arm Precision-to-Rapid mode',async()=>{
    const f=fixture(),p=await f.ready();const body={...f.body,preset:{xyStep:.5,zStep:.1,feedrate:1000}};
    f.s.arm(body);assert.equal(f.s.armed,true);f.s.setMode('adaptive');f.s.tick();
    const g=f.s.gate;p.emit('data',Buffer.from(`P2 VCAP ${boot} ${g.session} ${g.ticket} 1\n`));
    assert.throws(()=>f.s.arm(body),/Rapid/);assert.equal(f.s.armed,false);
});

test('dev jog stream owns motion even while the latest CNC status still says Idle',()=>{
 const f=machine();f.c.jogStreamer={isActive:()=>true};assert.equal(f.m.canArm(),false);
 f.m.submit({axis:'X',direction:1},preset);assert.throws(()=>f.m.tick(),/no longer permits/);assert.equal(f.writes.length,0);
});
test('new dev jog stream cannot take old knob receipts or start before its cancellation barrier',()=>{
 for(const cmd of ['jog:start','jog:update','jog:feed']){
  const f=machine();f.m.submit({axis:'X',direction:1},preset);f.m.tick();
  assert.throws(()=>f.c.command(cmd,{X:1},1000),/still stopping/);assert.equal(f.m.owned,false);assert.equal(f.m.cancelPending,1);
  f.c.runner.emit('ok');assert.throws(()=>f.c.command(cmd,{X:1},1000),/still stopping/);
  f.time(120);f.status();f.c.command(cmd,{X:1},1000);assert.equal(f.commands.at(-1)[0],cmd);
 }
});
