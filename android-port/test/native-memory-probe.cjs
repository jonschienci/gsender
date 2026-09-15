// Run with the isolated Java JNI probe and libraries extracted from the APK.
// It exercises the actual launch flags; no USB devices or CNC commands are used.
const assert = require('node:assert/strict');
const v8 = require('node:v8');
const MiB = 1024 * 1024;
assert.equal(process.platform, 'android');
assert.equal(process.arch, 'arm');
const heapLimitMiB = v8.getHeapStatistics().heap_size_limit / MiB;
assert.ok(heapLimitMiB >= 768 && heapLimitMiB < 832, 'Expected the 768 MiB old-space budget');
// Dense JS arrays consume V8 heap, unlike Buffers which use external memory.
// Keep 512 MiB live to demonstrate allocation beyond the previous 384 MiB cap.
const retained = globalThis.__memoryProbe = [];
for (let i = 0; i < 64; i++) retained.push(new Array(2 * MiB).fill(i));
const heapUsedMiB = process.memoryUsage().heapUsed / MiB;
assert.ok(heapUsedMiB > 500);
const bridge = process._linkedBinding('gsender_usb');
const timeout = setTimeout(() => { console.error('MEMORY_PROBE_FAIL timeout'); process.exit(1); }, 5000);
bridge.subscribe(value => {
    assert.equal(value, 'memory-probe-ready');
    assert.equal(globalThis.__memoryProbe[63][2 * MiB - 1], 63);
    clearTimeout(timeout);
    console.log('MEMORY_PROBE_PASS ' + JSON.stringify({node:process.version, heapLimitMiB,
        heapUsedMiB:Math.round(heapUsedMiB), rssMiB:Math.round(process.memoryUsage().rss / MiB)}));
    process.exit(0);
});
bridge.send('memory-probe-ready');
