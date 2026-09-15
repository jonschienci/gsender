'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const tls = require('node:tls');
const { EventEmitter } = require('node:events');
const { WifiPort, pairing, CIPHER, PORT } = require('../pendant/wifi-transport.cjs');
const { WifiNetwork } = require('../runtime/wifi-network.cjs');
const { Gate } = require('../pendant/protocol.cjs');
const { Pendant } = require('../pendant/service.cjs');
const credentials = { version: 1, device: 'wisecoco-123456abcdef', host: '192.168.1.80', port: PORT, psk: '12'.repeat(32) };
const json = JSON.stringify(credentials), boot = '0123456789abcdef';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const open = port => new Promise((resolve, reject) => port.open(err => err ? reject(err) : resolve()));

function network() {
    return { starts: 0, connections: 0, releases: 0,
        async acquire(address, lost) {
            this.starts++; this.lost = lost;
            return { connected: () => this.connections++, release: () => this.releases++ };
        }
    };
}
async function server(t, overrides = {}, onConnect = () => {}) {
    const peers = new Set();
    const result = tls.createServer({ minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', ciphers: CIPHER,
        pskCallback: (socket, identity) => identity === credentials.device ? Buffer.from(credentials.psk, 'hex') : null,
        ...overrides,
    }, socket => { peers.add(socket); socket.on('error', () => {}); onConnect(socket); });
    result.on('tlsClientError', () => {});
    await new Promise((resolve, reject) => { result.once('error', reject); result.listen(0, '127.0.0.1', resolve); });
    t.after(async () => { for (const peer of peers) peer.destroy(); await new Promise(resolve => result.close(resolve)); });
    return result;
}
function portFor(t, srv, config = pairing(json), options = {}) {
    const n = network(), errors = [];
    const p = new WifiPort(config, { network: n,
        // Only the test dialer redirects to a real loopback TLS listener.
        dial: opts => tls.connect({ ...opts, host: '127.0.0.1', port: srv.address().port }), ...options });
    p.on('error', error => errors.push(error.message)); t.after(() => p.destroy());
    return { p, n, errors };
}
test('pairing is strict, errors do not echo secrets, host override never alters identity/key', () => {
    const p = pairing(json, '192.168.1.90');
    assert.equal(p.host, '192.168.1.90'); assert.equal(p.device, credentials.device); assert.equal(p.psk.length, 32);
    for (const value of ['secret:' + credentials.psk, JSON.stringify({ ...credentials, port: 80 }),
        JSON.stringify({ ...credentials, version: 2 }), JSON.stringify({ ...credentials, psk: 'bad' }),
        JSON.stringify({ ...credentials, device: null }), JSON.stringify({ ...credentials, extra: true }),
        JSON.stringify({ ...credentials, host: '127.0.0.1' }), JSON.stringify({ ...credentials, host: 'host.local' })]) {
        assert.throws(() => pairing(value), error => !error.message.includes(credentials.psk));
    }
});
test('actual loopback TLS-PSK authenticates, carries P2 and only accepts outgoing STATE', { timeout: 5000 }, async t => {
    let peer, received = '';
    const srv = await server(t, {}, socket => { peer = socket; socket.on('data', bytes => received += bytes); });
    const { p, n } = portFor(t, srv);
    await open(p); assert.equal(p.isOpen, true); assert.equal(n.connections, 1);
    assert.equal(p.socket.getProtocol(), 'TLSv1.2'); assert.equal(p.socket.getCipher().name, CIPHER);
    while (!peer) await pause(1);
    const data = new Promise(resolve => p.once('data', resolve));
    peer.write(`P2 HELLO ${boot} 2 1 0\n`);
    assert.match((await data).toString(), /P2 HELLO/);
    await new Promise((resolve, reject) => p.write(Buffer.from(`P2 STATE ${'a'.repeat(32)} 1 1 0 0 0 0 DISARMED 500\n`), err => err ? reject(err) : resolve()));
    while (!received) await pause(1);
    assert.match(received, /DISARMED/);
    let rejected;
    p.write(Buffer.from('M1 FLASH erase\n'), err => rejected = err);
    assert.ok(rejected); assert.equal(p.destroyed, true); assert.equal(n.releases, 1);
    assert.equal(received.includes('M1'), false);
});
test('actual TLS wrong key, wrong identity and incompatible cipher never establish a stream', { timeout: 5000 }, async t => {
    let accepted = 0;
    const srv = await server(t, {}, () => accepted++);
    for (const config of [{ ...pairing(json), psk: Buffer.alloc(32, 3) }, { ...pairing(json), device: 'wisecoco-000000000000' }]) {
        const { p, n, errors } = portFor(t, srv, config);
        await assert.rejects(open(p)); assert.equal(p.isOpen, false); assert.equal(n.connections, 0);
        assert.equal(n.releases, 1); assert.ok(errors.every(e => !e.includes(credentials.psk)));
    }
    const other = await server(t, { ciphers: 'PSK-AES256-GCM-SHA384' }, () => accepted++);
    const { p } = portFor(t, other); await assert.rejects(open(p)); assert.equal(accepted, 0);
});
test('actual TLS remote close revokes the network lease once', { timeout: 5000 }, async t => {
    let peer; const srv = await server(t, {}, socket => peer = socket);
    const { p, n } = portFor(t, srv); await open(p);
    while (!peer) await pause(1);
    const closed = new Promise(resolve => p.once('close', resolve)); peer.end(); await closed;
    assert.equal(p.isOpen, false); assert.equal(n.releases, 1); p.destroy(); assert.equal(n.releases, 1);
});
function fakeSocket() {
    const socket = new EventEmitter();
    Object.assign(socket, { authorized: true, writableLength: 0, writes: [], setNoDelay(value) { this.noDelay = value; },
        disableRenegotiation() {}, getProtocol: () => 'TLSv1.2', getCipher: () => ({ name: CIPHER }),
        write(bytes, done) { this.writes.push(bytes); this.done = done; }, destroy() { this.destroyed = true; } });
    return socket;
}
async function fakePort(t, now = () => 0) {
    const socket = fakeSocket(), n = network(), errors = [];
    const p = new WifiPort(pairing(json), { network: n, now,
        dial: () => { queueMicrotask(() => socket.emit('secureConnect')); return socket; } });
    p.on('error', err => errors.push(err)); t.after(() => p.destroy()); await open(p);
    return { p, socket, n, errors };
}
const state = Buffer.from('P2 STATE abc 1 1 0 0 0 0 DISARMED 500\n');
test('one in-flight Wi-Fi write: a second write closes instead of queuing', async t => {
    const { p, socket, n } = await fakePort(t); let callbacks = 0;
    p.write(state, () => callbacks++); p.write(state, () => callbacks++);
    assert.equal(socket.writes.length, 1); assert.equal(p.destroyed, true); assert.equal(callbacks, 2); assert.equal(n.releases, 1);
    socket.done(); assert.equal(callbacks, 2);
});
test('write callback at the 100ms deadline fails even when its timer has not run', async t => {
    let now = 0; const { p, socket } = await fakePort(t, () => now); let error;
    p.write(state, e => error = e); now = 100; socket.done();
    assert.equal(p.destroyed, true); assert.ok(error); assert.equal(socket.writes.length, 1);
});
test('write stall timer closes transport without later replay', async t => {
    const { p, socket } = await fakePort(t); p.write(state, () => {});
    await pause(130); assert.equal(p.destroyed, true); socket.done(); assert.equal(socket.writes.length, 1);
});
test('native lease cancellation and late replies cannot revive an abandoned connection', async () => {
    const requests = [], bridge = new WifiNetwork(json => requests.push(JSON.parse(json)));
    const abort = new AbortController();
    const first = bridge.acquire(credentials.host, () => assert.fail('cancel must not revive'), abort.signal);
    const rejected = assert.rejects(first); abort.abort(); await rejected;
    assert.equal(bridge.current, null);
    const next = bridge.acquire(credentials.host, () => {});
    bridge.receive({ id: 1, state: 'ready' }); assert.equal(bridge.current.ready, false);
    bridge.receive({ id: 2, state: 'ready' }); const lease = await next;
    lease.connected(); lease.release(); lease.release();
    assert.deepEqual(requests.map(r => [r.op, r.id]), [['start',1],['stop',1],['start',2],['connected',2],['stop',2]]);
});

function gate() {
    let time = 0; const g = new Gate(boot, () => time, true);
    const alive = () => `P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500`;
    const detent = (seq = 1, ticket = g.ticket) => `P2 DETENT ${boot} ${g.session} ${seq} ${ticket} X 1 500`;
    g.state([0,0,0], true, 'IDLE'); g.receive(alive()); g.state([0,0,0], true, 'IDLE', true);
    return { g, alive, detent, time: value => time = value };
}
test('wireless DETENT accepts 99ms, discards 100ms, and duplicate sequences never replay', () => {
    const a = gate(); a.time(99); assert.equal(a.g.receive(a.detent()).queueDeadline, 100);
    assert.equal(a.g.receive(a.detent()), undefined);
    const b = gate(); b.time(100); assert.equal(b.g.receive(b.detent()), undefined); assert.equal(b.g.dropped, 1);
});
test('wireless duplicate ALIVE/VCAP cannot renew freshness; heartbeats expire at 250ms', () => {
    const { g, time } = gate();
    const alive = `P2 ALIVE ${boot} ${g.session} 1 1 0 0 500`;
    time(80); g.receive(alive); assert.equal(g.aliveAt, 0);
    const cap = `P2 VCAP ${boot} ${g.session} 2 1`; g.receive(cap);
    time(99); g.receive(cap); assert.equal(g.velocityAt, 80);
    time(249); assert.equal(g.healthy(), true); time(250); assert.equal(g.healthy(), false);
});
test('wireless session mismatch and sequence gaps close, stale echoes never restore a lease', () => {
    const a = gate(); assert.throws(() => a.g.receive(a.detent().replace(a.g.session, 'f'.repeat(32))));
    assert.throws(() => a.g.receive(a.detent(2))); a.time(251); assert.throws(() => a.g.receive(a.alive()), /lease expired/); assert.equal(a.g.healthy(), false);
});
function fixture() {
    let time = 0, serialLists = 0; const ports = [], writes = [], commands = [];
    const cnc = { type:'GrblHAL', options:{port:'android-usb:42:0'}, settings:{settings:{'$13':'0','$110':'2000','$111':'2000','$112':'1000','$120':'100','$121':'100','$122':'100'}},
        workflow:{state:'idle'}, feeder:{toJSON:()=>({hold:false,pending:false,queue:0})},
        connection:{connection:{port:{isOpen:true,writableLength:0,writeBounded(){}}}}, runner:new EventEmitter(),
        isOpen:()=>true, command(cmd,...args){commands.push([cmd,...args]);}, writeln(line){writes.push(line);} };
    // Controller registers both connection and runner listeners.
    const raw = cnc.connection.connection; cnc.connection = new EventEmitter(); cnc.connection.connection = raw;
    cnc.runner.state = {status:{activeState:'Idle',mpos:{x:0,y:0,z:0}}};
    class Port extends EventEmitter {
        constructor(config){super();this.path='wifi:'+config.device;this.writes=[];ports.push(this);}
        open(cb){this.isOpen=true;cb();}
        write(bytes,cb){this.writes.push(bytes.toString());cb();}
        destroy(){if(this.destroyed)return;this.destroyed=true;this.isOpen=false;this.emit('close');}
    }
    const s = new Pendant({SerialPort:{list:async()=>{serialLists++;return[];}},getControllers:()=>({cnc}),WifiTransport:Port,now:()=>time});
    const body = {session:'a'.repeat(32),visible:true,preset:{xyStep:.5,zStep:.1,feedrate:1000,rapidFeedrate:5000}};
    const status = () => cnc.runner.emit('status',cnc.runner.state.status);
    async function ready() {
        s.configurePairing(json); s.setTransport('wifi'); await s.connect(); const p = ports[0];
        p.emit('data',Buffer.from(`P2 HELLO ${boot} 2 1 0\n`));s.tick();status();
        p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${s.gate.session} ${s.gate.ticket} 1 0 0 500\n`));return p;
    }
    return {s,ready,cnc,ports,writes,commands,body,status,time:n=>time=n,serialLists:()=>serialLists};
}
test('wireless service uses the existing CNC controller, starts disarmed, sends STATE every40ms, hides PSK', async () => {
    const f = fixture(), p = await f.ready();
    assert.equal(f.serialLists(),0); assert.equal(f.s.armed,false); assert.equal(f.writes.length,0);
    const first = p.writes[0].trim().split(' '); assert.equal(first[5],'0');
    f.time(39);f.s.tick();assert.equal(p.writes.length,1);f.time(40);f.s.tick();assert.equal(p.writes.length,2);
    assert.equal(JSON.stringify(f.s.status()).includes(credentials.psk),false);
    assert.throws(()=>f.s.setTransport('usb'));assert.throws(()=>f.s.configurePairing(json));f.s.disconnect();
});
test('wireless pending motion expires with the ticket instead of entering the CNC after100ms', async () => {
    const f=fixture(),p=await f.ready();f.s.arm(f.body);f.time(40);f.s.tick();
    const g=f.s.gate;f.cnc.connection.connection.port.writableLength=1;
    p.emit('data',Buffer.from(`P2 DETENT ${boot} ${g.session} 1 ${g.ticket} X 1 500\n`));
    f.time(140);f.cnc.connection.connection.port.writableLength=0;f.status();f.s.tick();
    assert.equal(f.writes.length,0);assert.equal(f.s.machine.queue.length,0);f.s.disconnect();
});
test('wireless heartbeat loss cancels owned motion at250ms; no reconnect, USB failover or re-arm', async () => {
    const f=fixture(),p=await f.ready();f.s.arm(f.body);f.time(40);f.s.tick();const g=f.s.gate;
    p.emit('data',Buffer.from(`P2 DETENT ${boot} ${g.session} 1 ${g.ticket} X 1 500\n`));f.s.tick();
    assert.equal(f.writes.length,1);f.time(250);f.status();f.s.tick();
    assert.equal(f.s.port,null);assert.equal(f.s.armed,false);assert.equal(f.commands.filter(c=>c[0]==='jog:stop').length,1);
    f.time(1000);f.s.tick();assert.equal(f.ports.length,1);assert.equal(f.serialLists(),0);assert.equal(f.s.transport,'wifi');
});
test('wireless boot text/maintenance and a reboot are rejected; transport disconnect does not reconnect', async () => {
    for(const line of ['M1 READY','ROM boot',`P2 HELLO ${'f'.repeat(16)} 2 1 0`]) {
        const f=fixture(),p=await f.ready();p.emit('data',Buffer.from(line+'\n'));
        assert.equal(f.s.port,null);assert.equal(f.s.armed,false);assert.equal(f.writes.length,0);
    }
});
test('pairing is session-only; forget clears it and transport remains explicitly selected', () => {
    const f=fixture();f.s.configurePairing(json);f.s.configurePairing('', '192.168.1.90');
    assert.equal(f.s.status().wifiHost,'192.168.1.90'); f.s.forgetPairing();assert.equal(f.s.status().pairingConfigured,false);
    assert.equal(new Pendant({SerialPort:{},getControllers:()=>({})}).status().transport,'usb');
});

test('freshly echoed heartbeat cannot revive a wireless lease after250ms before the timer runs', () => {
    const {g,time,alive}=gate();time(240);g.state([0,0,0],true,'IDLE',true);time(250);
    assert.throws(()=>g.receive(alive()), /lease expired/);assert.equal(g.healthy(),false);
});
test('10-second link probe sends only invalid/disarmed STATE and never touches CNC commands', async () => {
    const f=fixture();f.s.configurePairing(json);f.s.setTransport('wifi');await f.s.connect({probe:true});
    const p=f.ports[0];p.emit('data',Buffer.from(`P2 HELLO ${boot} 2 1 0\n`));
    f.s.machine.sync=()=>assert.fail('Probe must not attach CNC');
    f.s.tick();assert.throws(()=>f.s.arm(f.body),/cannot arm/);
    for(let time=0;time<10000;time+=40){
        f.time(time);f.s.tick();const g=f.s.gate;
        f.time(time+10);p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 1 0 0 500\n`));
    }
    f.time(10000);f.s.tick();assert.equal(f.s.port,null);assert.equal(f.s.armed,false);
    const report=f.s.status().wifiProbe;assert.equal(report.running,false);assert.equal(report.samples,250);
    assert.equal(report.medianMs,10);assert.equal(report.maxMs,10);assert.match(report.result,/complete/);
    assert.ok(p.writes.every(line=>{const parts=line.trim().split(' ');return parts[4]==='0'&&parts[5]==='0';}));
    assert.deepEqual(f.commands,[]);assert.deepEqual(f.writes,[]);assert.equal(f.serialLists(),0);
});

test('wireless delayed WHEEL subtracts ticket transit age and repeated samples cannot extend release', () => {
    const {g,time}=gate();g.receive(`P2 VCAP ${boot} ${g.session} ${g.ticket} 1`);
    time(90);
    const sample=g.receive(`P2 WHEEL ${boot} ${g.session} 1 ${g.ticket} X 1 30 0 500`);
    assert.equal(sample.expires,180); // only90ms remain, not180ms from late arrival
    g.state([0,0,0],true,'VEL_ARMED',true);time(110);
    const repeat=g.receive(`P2 WHEEL ${boot} ${g.session} 1 ${g.ticket} X 1 30 20 500`);
    assert.equal(repeat.expires,180);
    const aged=g.receive(`P2 WHEEL ${boot} ${g.session} 2 ${g.ticket} X 1 30 120 500`);
    assert.equal(aged.expires,150);assert.equal(aged.direction,1);
    time(151);g.state([0,0,0],true,'VEL_ARMED',true);
    const late=g.receive(`P2 WHEEL ${boot} ${g.session} 2 ${g.ticket} X 1 30 161 500`);
    assert.equal(late.direction,0);assert.ok(late.expires<=150);
});
test('wireless fresh not-ready echoes allow bounded startup without arming', async () => {
    const f=fixture();f.s.configurePairing(json);f.s.setTransport('wifi');await f.s.connect();const p=f.ports[0];
    p.emit('data',Buffer.from(`P2 HELLO ${boot} 2 0 0\n`));f.s.tick();
    for(let time=0;time<6000;time+=40){
        f.time(time);const g=f.s.gate;
        p.emit('data',Buffer.from(`P2 ALIVE ${boot} ${g.session} ${g.ticket} 0 0 0 500\n`));f.s.tick();
        assert.equal(f.s.port,p);assert.equal(f.s.armed,false);
    }
    f.time(6000);f.s.tick();assert.equal(f.s.port,null);assert.match(f.s.reason,/readiness/);
});

test('wireless queue deadline does not change legacy USB event queue timing', () => {
    const f=fixture(),m=f.s.machine;m.sync();f.status();m.owned=true;
    m.submit({axis:'X',direction:1,stepUm:500,expires:0},f.body.preset);
    f.time(100);f.status();m.tick();assert.equal(f.writes.length,1);m.detach();
});
