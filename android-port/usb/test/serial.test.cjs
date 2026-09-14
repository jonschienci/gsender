const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { Transform } = require('node:stream');
const { createSerialPort } = require('../js/index.cjs');

function rig(overrides = {}, options = {}) {
    let receive;
    const sent = [];
    const api = createSerialPort({
        timeout: 100, permissionTimeout: 100,
        subscribe(fn) { receive = fn; return () => {}; },
        send(json) {
            const r = JSON.parse(json); sent.push(r);
            queueMicrotask(async () => {
                try {
                    const result = overrides[r.op] ? await overrides[r.op](r) : null;
                    receive(JSON.stringify({ id: r.id, result }));
                } catch (error) {
                    receive(JSON.stringify({ id: r.id, error: { code: error.code, message: error.message } }));
                }
            });
        }, ...options,
    });
    const port = new api.SerialPort({ path: 'android-usb:42:0', autoOpen: false });
    const errors = [];
    port.on('error', (err) => errors.push(err));
    return { ...api, port, sent, errors, event: (event) => receive(JSON.stringify({ session: port.session, ...event })) };
}
const open = (port) => new Promise((resolve, reject) => port.open(err => err ? reject(err) : resolve()));
const close = (port) => new Promise(resolve => port.close(resolve));
const write = (port, bytes) => new Promise((resolve, reject) => port.write(bytes, err => err ? reject(err) : resolve()));
const bounded = (port, bytes) => new Promise((resolve, reject) => port.writeBounded(Buffer.from(bytes), err => err ? reject(err) : resolve()));

test('finite pendant writes carry native queue deadline; other writes remain unchanged', async () => {
    const r=rig();await open(r.port);
    await bounded(r.port,'$J=G21G91 X0.5000 F1000.000\n');
    await write(r.port,Buffer.from('?'));
    const writes=r.sent.filter(m=>m.op==='write');
    assert.equal(writes[0].maxQueueMs,250);assert.equal(writes[1].maxQueueMs,undefined);
    await close(r.port);r.dispose();
});
test('pendant move cannot be queued behind a stalled ordinary USB write', async () => {
    let finish;const r=rig({write:()=>new Promise(resolve=>{finish=resolve;})});await open(r.port);
    const pending=write(r.port,Buffer.from('?'));
    await new Promise(resolve=>setImmediate(resolve));
    await assert.rejects(bounded(r.port,'$J=G21G91 X0.5000 F1000.000\n'),/queue/);
    assert.equal(r.sent.filter(m=>m.op==='write').length,1);
    finish();await pending;await close(r.port);r.dispose();
});
test('expired native pendant write fails without any resend', async () => {
    const r=rig({write:()=>{throw Object.assign(Error('expired before transmission'),{code:'ETIMEDOUT'});}});await open(r.port);
    await assert.rejects(bounded(r.port,'$J=G21G91 X0.5000 F1000.000\n'),/expired/);
    await new Promise(resolve=>setImmediate(resolve));assert.equal(r.sent.filter(m=>m.op==='write').length,1);r.dispose();
});

test('list preserves VID/PID/path metadata', async () => {
    const devices = [{ path: 'android-usb:42:0', vendorId: '0483', productId: '5740' }];
    const r = rig({ list: () => devices });
    assert.deepEqual(await r.SerialPort.list(), devices);
    await close(r.port); r.dispose();
});

test('binary control bytes and fragmented input survive unchanged through streams', async () => {
    const r = rig(); await open(r.port);
    const bytes = Buffer.from([0, 0x18, 0x80, 0x85, 0xff, 10]);
    await write(r.port, bytes);
    assert.deepEqual(Buffer.from(r.sent.find(x => x.op === 'write').data, 'base64'), bytes);
    let partial = ''; const lines = [];
    const parser = new Transform({ transform(chunk, enc, cb) {
        partial += chunk.toString();
        let pos;
        while ((pos = partial.indexOf('\n')) >= 0) { lines.push(partial.slice(0, pos)); partial = partial.slice(pos + 1); }
        cb();
    } });
    r.port.pipe(parser);
    for (const text of ['<Idle|MPos:0', ',0,0>\nok', '\n']) r.event({ event: 'data', data: Buffer.from(text).toString('base64') });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(lines, ['<Idle|MPos:0,0,0>', 'ok']);
    await close(r.port); r.dispose();
});

test('writes serialize and callbacks wait for native completion', async () => {
    let finish; let calls = 0;
    const r = rig({ write: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
    await open(r.port);
    const a = write(r.port, Buffer.from('a')); const b = write(r.port, Buffer.from('b'));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 1);
    finish(); await a;
    await new Promise(resolve => setImmediate(resolve)); assert.equal(calls, 2);
    finish(); await b; await close(r.port); r.dispose();
});

test('permission denial reaches open callback and cancels native session', async () => {
    const r = rig({ open: () => { throw Object.assign(new Error('Denied'), { code: 'EACCES' }); } });
    await assert.rejects(open(r.port), { code: 'EACCES' });
    assert.equal(r.port.isOpen, false);
    assert.equal(r.sent.filter(x => x.op === 'close').length, 1);
    await close(r.port); r.dispose();
});

test('detach emits one close, destroys transport and ignores stale data', async () => {
    const r = rig(); await open(r.port);
    let closes = 0; let reason; r.port.on('close', err => { closes++; reason = err; });
    r.event({ event: 'close', error: { code: 'ENODEV', message: 'Detached' } });
    r.event({ event: 'close' });
    r.event({ event: 'data', data: 'b2sK' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closes, 1); assert.equal(r.port.isOpen, false);
    assert.equal(r.errors.length, 0); assert.equal(reason.code, 'ENODEV'); assert.equal(reason.disconnected, true); assert.equal(r.port.readableLength, 0);
    r.dispose();
});

test('partial-write failure is never retried and queued writes do not reach USB', async () => {
    const r = rig({ write: () => { throw Object.assign(new Error('Partial write'), { code: 'EIO' }); } });
    await open(r.port);
    const results = await Promise.allSettled([write(r.port, Buffer.from('G1 X1\n')), write(r.port, Buffer.from('G1 X2\n'))]);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(results[0].status, 'rejected'); assert.equal(results[1].status, 'rejected');
    assert.equal(r.sent.filter(x => x.op === 'write').length, 1);
    assert.equal(r.port.isOpen, false); r.dispose();
});

test('timeout cancels outstanding open and late result cannot reopen destroyed port', async () => {
    let finish;
    const r = rig({ open: () => new Promise(resolve => { finish = resolve; }) }, { permissionTimeout: 10 });
    await assert.rejects(open(r.port), { code: 'ETIMEDOUT' });
    await close(r.port); finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.port.isOpen, false); r.dispose();
});

test('closing during permission request cannot resurrect port', async () => {
    let finish;
    const r = rig({ open: () => new Promise(resolve => { finish = resolve; }) });
    r.port.open();
    await new Promise(resolve => setImmediate(resolve));
    await close(r.port); finish();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.port.isOpen, false); r.dispose();
});

test('receive overflow fails closed', async () => {
    const r = rig(); await open(r.port);
    r.event({ event: 'data', data: Buffer.alloc(1024 * 1024 + 1).toString('base64') });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(r.errors[0].code, 'EOVERFLOW'); assert.equal(r.port.isOpen, false); r.dispose();
});

test('initial CDC signal levels and explicit DTR/RTS changes are forwarded', async () => {
    const r = rig(); await open(r.port);
    assert.equal(r.sent.some(x => x.op === 'set'), false);
    assert.equal(r.sent.find(x => x.op === 'open').options.dtr, true);
    assert.equal(r.sent.find(x => x.op === 'open').options.rts, true);
    await new Promise((resolve, reject) => r.port.set({ dtr: true, rts: false }, err => err ? reject(err) : resolve()));
    assert.deepEqual(r.sent.find(x => x.op === 'set').signals, { dtr: true, rts: false });
    await close(r.port); r.dispose();
});

test('data arriving with open response is buffered until open listeners run', async () => {
    let finish;
    const r = rig({ open: () => new Promise(resolve => { finish = resolve; }) });
    const opening = open(r.port);
    await new Promise(resolve => setImmediate(resolve));
    r.event({ event: 'data', data: Buffer.from('startup\n').toString('base64') });
    const received = []; r.port.on('data', b => received.push(b));
    finish(); await opening;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(Buffer.concat(received).toString(), 'startup\n');
    await close(r.port); r.dispose();
});

test('unknown sessions cannot inject data', async () => {
    const r = rig(); await open(r.port);
    r.event({ session: 'stale', event: 'data', data: 'b2sK' });
    assert.equal(r.port.readableLength, 0);
    await close(r.port); r.dispose();
});
