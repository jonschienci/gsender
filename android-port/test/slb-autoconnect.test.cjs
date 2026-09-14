const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SlbAutoConnect, isSlb } = require('../runtime/slb-autoconnect.cjs');
const slb = id => ({ path: `android-usb:${id}:0`, vendorId: '0483', productId: '5740' });
function fixture() {
    const f = { ports: [], connection: null, calls: [], ui: true };
    f.connector = new SlbAutoConnect({
        list: async () => f.ports,
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
    assert.deepEqual(f.calls[0].slice(0, 2), ['android-usb:42:0', { baudrate:115200, network:false, defaultFirmware:'GrblHAL' }]);
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
    await f.connector.scan(); f.calls[0][2](new Error('Permission denied'));
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
    await f.connector.scan(); assert.ok(f.connector.attempted.has(slb(42).path));
    let resolve;
    f.connector.list = () => new Promise(r => { resolve = r; });
    const scan = f.connector.scan(); f.ui = false; resolve([slb(43)]); await scan;
    assert.equal(f.calls.length, 0);
    f.ui = true; const stopped = f.connector.scan(); f.connector.stop(); resolve([slb(43)]); await stopped;
    assert.equal(f.calls.length, 0);
});
