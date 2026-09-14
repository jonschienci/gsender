const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { transformSync } = require('esbuild');
const { createSerialPort } = require('../js/index.cjs');

test('unmodified upstream SerialConnection opens, parses input and writes control bytes', async () => {
    let receive;
    const sent = [];
    const api = createSerialPort({
        subscribe(fn) { receive = fn; return () => {}; },
        send(json) {
            const r = JSON.parse(json); sent.push(r);
            queueMicrotask(() => receive(JSON.stringify({ id: r.id, result: null })));
        },
    });
    const source = path.resolve(__dirname, '../../../src/server/lib/SerialConnection.js');
    const compiled = transformSync(fs.readFileSync(source, 'utf8'), { format: 'cjs', target: 'node18' }).code;
    const loaded = new Module(source, module);
    loaded.filename = source;
    loaded.require = (id) => id === 'serialport' ? api : require(id);
    loaded._compile(compiled, source);
    const connection = new loaded.exports.default({ path: 'android-usb:42:0' });
    const lines = [];
    connection.on('data', line => lines.push(line));
    await new Promise((resolve, reject) => connection.open(err => err ? reject(err) : resolve()));
    assert.equal(connection.isOpen, true);
    const session = sent.find(r => r.op === 'open').session;
    for (const chunk of ['<Idle|MPos:0,', '0,0>\nok\n']) {
        receive(JSON.stringify({ event: 'data', session, data: Buffer.from(chunk).toString('base64') }));
    }
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(lines, ['<Idle|MPos:0,0,0>', 'ok']);
    connection.write('G0 X0\n');
    connection.writeImmediate(Buffer.from([0x85]));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(sent.filter(r => r.op === 'write').map(r => Buffer.from(r.data, 'base64')),
        [Buffer.from('G0 X0\n'), Buffer.from([0x85])]);
    await new Promise((resolve, reject) => connection.close(err => err ? reject(err) : resolve()));
    assert.equal(Boolean(connection.isOpen), false);
    api.dispose();
});

test('Android build alias is explicit and independent of build machine paths', () => {
    const plugin = require('../js/esbuild-plugin.cjs');
    assert.throws(() => plugin('/tmp/serialport.cjs'), TypeError);
    let resolve;
    plugin('./android-usb/serialport.cjs').setup({ onResolve(filter, fn) { resolve = fn; } });
    assert.deepEqual(resolve(), { path: './android-usb/serialport.cjs', external: true });
});

// A detach must follow serialport's close(error) contract, without a stream error.
test('upstream connection survives unplug and a newly enumerated device can reopen', async () => {
    let receive;
    let device = 42;
    let session;
    const api = createSerialPort({
        subscribe(fn) { receive = fn; return () => {}; },
        send(json) {
            const r = JSON.parse(json);
            if (r.op === 'open') session = r.session;
            queueMicrotask(() => receive(JSON.stringify({ id: r.id, result:
                r.op === 'list' ? [{path: `android-usb:${device}:0`}] : null })));
        },
    });
    const source = path.resolve(__dirname, '../../../src/server/lib/SerialConnection.js');
    const loaded = new Module(source, module);
    loaded.filename = source;
    loaded.require = id => id === 'serialport' ? api : require(id);
    loaded._compile(transformSync(fs.readFileSync(source, 'utf8'), {format:'cjs', target:'node18'}).code, source);
    for (let cycle = 0; cycle < 3; cycle++) {
        const [port] = await api.SerialPort.list();
        const connection = new loaded.exports.default({path:port.path});
        await new Promise((resolve,reject) => connection.open(err => err ? reject(err) : resolve()));
        const closed = new Promise(resolve => connection.once('close', resolve));
        receive(JSON.stringify({event:'close',session,error:{code:'ENODEV',message:'Detached'}}));
        const error = await closed;
        assert.equal(error.disconnected, true);
        assert.equal(connection.isOpen, false);
        device++;
    }
    api.dispose();
});
