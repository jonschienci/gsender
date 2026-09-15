const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SlbAutoConnect, isSlb } = require('../runtime/slb-autoconnect.cjs');
const slb = id => ({ path: `android-usb:${id}:0`, vendorId: '0483', productId: '5740', usbPermission: true });
function fixture() {
    const f = { ports: [], connection: null, calls: [], ui: true, now: 0 };
    f.connector = new SlbAutoConnect({
        list: async () => f.ports, now: () => f.now,
        getConnection: () => f.connection,
        getOpener: () => f.ui ? (...args) => f.connector.open((...call) => f.calls.push(call), ...args) : null,
    });
    return f;
}
test('SLB identity excludes ESP knobs, other adapters, desktop paths and extra interfaces', () => {
    assert.ok(isSlb(slb(42)));
    for (const p of [
        { ...slb(42), vendorId: '303a', productId: '1001' },
        { ...slb(42), productId: '0000' },
        { ...slb(42), path: '/dev/ttyACM0' },
        { ...slb(42), path: 'android-usb:42:1' },
    ]) assert.equal(isSlb(p), false);
});
test('opens an attached SLB once, then reconnects using its new Android USB path', async () => {
    const f = fixture(); f.ports = [slb(42)];
    await f.connector.scan();
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.calls[0].slice(0, 2), ['android-usb:42:0', { baudrate:115200, network:false, defaultFirmware:'GrblHAL', requestPermission:false }]);
    await f.connector.scan(); assert.equal(f.calls.length, 1);
    f.connection = {}; f.calls[0][2](null);
    await f.connector.scan(); assert.equal(f.calls.length, 1);
    f.connection = null; f.ports = [slb(43)];
    await f.connector.scan(); assert.equal(f.calls[1][0], 'android-usb:43:0');
});
test('manual disconnect and permission denial stay suppressed until detach', async () => {
    const f = fixture(); f.ports = [slb(42)];
    f.connector.suppress(slb(42).path);
    await f.connector.scan(); assert.equal(f.calls.length, 0);
    f.ports = []; await f.connector.scan(); f.ports = [slb(42)];
    f.connector.open((...args) => f.calls.push(args), slb(42).path, {}, () => {});
    f.calls[0][2](Object.assign(new Error('Permission denied'), {code:'EACCES'}));
    f.now = 60000;
    await f.connector.scan(); await f.connector.scan(); assert.equal(f.calls.length, 1);
    // Explicit Connect is still allowed on the same attachment.
    f.connector.open((...args) => f.calls.push(args), slb(42).path, {}, () => {});
    assert.equal(f.calls.length, 2);
});
test('does not replace a manual/active connection, select multiple SLBs, or open without a UI', async () => {
    const f = fixture(); f.ports = [slb(42)]; f.connection = {};
    await f.connector.scan(); f.connection = null; f.ui = false;
    await f.connector.scan(); f.ui = true; f.ports.push(slb(43));
    await f.connector.scan(); assert.equal(f.calls.length, 0);
});
test('pending permission blocks duplicate manual opens; old close callbacks cannot unlock a new open', async () => {
    const f = fixture(); f.ports = [slb(42)]; await f.connector.scan();
    let error;
    f.connector.open(() => assert.fail('duplicate open'), slb(42).path, {}, e => { error = e; });
    assert.match(error.message, /already in progress/);
    f.calls[0][2](null); f.ports = [slb(43)]; await f.connector.scan();
    f.calls[0][2](new Error('old detach'));
    assert.ok(f.connector.opening);
    f.calls[1][2](null); assert.equal(f.connector.opening, null);
});
test('failed scans preserve suppression; delayed scans do not connect after stop or UI departure', async () => {
    const f = fixture(); f.connector.suppress(slb(42).path);
    f.connector.list = async () => { throw new Error('enumeration failed'); };
    await f.connector.scan(); assert.ok(f.connector.attachments.has(slb(42).path));
    let resolve;
    f.connector.list = () => new Promise(r => { resolve = r; });
    const scan = f.connector.scan(); f.ui = false; resolve([slb(43)]); await scan;
    assert.equal(f.calls.length, 0);
    f.ui = true; const stopped = f.connector.scan(); f.connector.stop(); resolve([slb(43)]); await stopped;
    assert.equal(f.calls.length, 0);
});

test('unexpected disconnect retries the same attachment; failed opens back off to 30 seconds', async () => {
    const f = fixture(); f.ports = [slb(42)];
    await f.connector.scan(); f.connection = {}; f.calls[0][2](null);
    f.now = 10000; f.connection = null; f.connector.disconnected(slb(42).path);
    await f.connector.scan(); assert.equal(f.calls.length, 1);
    f.now = 12000; await f.connector.scan(); assert.equal(f.calls.length, 2);
    for (const wait of [2000, 4000, 8000, 16000, 30000, 30000]) {
        f.calls.at(-1)[2](Object.assign(new Error('driver failed'), {code:'EIO'}));
        const count = f.calls.length;
        f.now += wait - 1; await f.connector.scan(); assert.equal(f.calls.length, count);
        f.now++; await f.connector.scan(); assert.equal(f.calls.length, count + 1);
    }
    f.connection = {}; f.calls.at(-1)[2](null);
    f.now += 100000; await f.connector.scan();
    assert.equal(f.calls.length, 8, 'Successful recovery ends retries');
});
test('automatic scans wait silently for a grant and never request Android permission', async () => {
    const f = fixture(); f.ports = [{...slb(42), usbPermission:false}];
    for (let i=0; i<5; i++) { f.now += 30000; await f.connector.scan(); }
    assert.equal(f.calls.length, 0);
    f.ports[0].usbPermission = true; await f.connector.scan();
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0][1].requestPermission, false);
    // Native open can still reject a grant revoked after enumeration.
    f.calls[0][2](Object.assign(new Error('grant lost'), {code:'EACCES'}));
    f.ports[0].usbPermission = false; f.now += 30000;
    await f.connector.scan(); assert.equal(f.calls.length, 1);
    f.ports[0].usbPermission = true; await f.connector.scan(); assert.equal(f.calls.length, 2);
});
