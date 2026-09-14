// Test fixture only: bundled separately and never included in the app payload.
const assert = require('node:assert/strict');
const path = require('node:path');
const { io } = require('socket.io-client');
const root = process.argv[2];
assert(root, 'Pass the isolated probe directory');
const deadline = setTimeout(() => { console.error('PROBE_FAIL timeout'); process.exit(1); }, 30000);
let socket;
const event = name => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out: ' + name)), 5000);
    socket.once(name, (...args) => { clearTimeout(timer); resolve(args); });
});
async function check(ready) {
    assert.equal(process.platform, process.env.PROBE_PLATFORM || 'android');
    assert.equal(process.versions.node, process.env.PROBE_NODE_VERSION || '24.21.0');
    const base = `http://127.0.0.1:${ready.port}`;
    assert.equal((await fetch(base)).status, 403);
    const response = await fetch(base, {headers: {'x-gsender-key': ready.token}});
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const pendant = await fetch(base + '/pendant/', {headers: {Cookie: cookie}});
    assert.equal(pendant.status, 200);
    assert.match(await pendant.text(), /id="root"/);
    socket = io(base, {autoConnect: false, transports: ['websocket'], extraHeaders: {Cookie: cookie}, reconnection: false});
    const connected = event('connect'); socket.connect(); await connected;
    for (let cycle = 0; cycle < 3; cycle++) {
        const listed = event('serialport:list'); socket.emit('list');
        const [ports] = await listed;
        const port = `android-usb:${42 + cycle}:0`;
        assert.equal(ports[0].port, port);
        await new Promise((resolve, reject) => socket.timeout(5000).emit('open', port,
            {baudrate:115200, defaultFirmware:'GrblHAL'}, (timeout, error) => timeout || error ? reject(timeout || error) : resolve()));
        const closed = event('serialport:close');
        process.emit('message', {test: 'detach'});
        await closed;
    }
    socket.close(); clearTimeout(deadline);
    console.log('PROBE_PASS ' + JSON.stringify({node: process.version, platform: process.platform, arch: process.arch,
        checks: ['authenticated backend', 'pendant assets', 'simulated USB open/detach/reconnect x3']}));
    process.exit(0);
}
process.send = message => {
    if (message.host === 'ready') check(message).catch(error => { console.error('PROBE_FAIL', error); process.exit(1); });
    else if (message.host === 'error') { console.error('PROBE_FAIL', message.message); process.exit(1); }
};
require(path.join(root, 'fake-native.cjs'));
require(path.join(root, 'runtime/bootstrap.cjs'));
