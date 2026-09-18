// Isolated JNI probe only; no USB devices or CNC commands. A stress allocation
// is opt-in through GSENDER_MEMORY_PROBE_MIB, never the default smoke test.
const assert = require('node:assert/strict');
const v8 = require('node:v8');
const MiB = 1024 * 1024;
assert.equal(process.platform, 'android');
assert.ok(['arm', 'arm64'].includes(process.arch));
const bridge = process._linkedBinding('gsender_usb');
const budget = bridge.memoryBudget();
assert.equal(budget.processBits, process.arch === 'arm64' ? 64 : 32);
assert.ok(budget.oldSpaceMiB < budget.appPlanningMiB);
if (process.arch === 'arm') assert.ok(budget.oldSpaceMiB <= 1536);
const heapLimitMiB = v8.getHeapStatistics().heap_size_limit / MiB;
assert.ok(heapLimitMiB >= budget.oldSpaceMiB && heapLimitMiB < budget.oldSpaceMiB + 256,
    'V8 launch flags must reflect the reported memory budget');
const allocationMiB = Number(process.env.GSENDER_MEMORY_PROBE_MIB || 8);
assert.ok(Number.isInteger(allocationMiB) && allocationMiB >= 0 && allocationMiB <= budget.oldSpaceMiB / 2);
const retained = globalThis.__memoryProbe = [];
// The pinned runtime has pointer compression disabled: dense Smi slots are
// four bytes on ARM32 and eight on ARM64. Report measured heap use as well.
for (let i = 0; i < allocationMiB; i++) retained.push(new Array(MiB / (budget.processBits / 8)).fill(i));
const timeout = setTimeout(() => { console.error('MEMORY_PROBE_FAIL timeout'); process.exit(1); }, 5000);
bridge.subscribe(value => {
    assert.equal(value, 'memory-probe-ready');
    if (allocationMiB) assert.equal(retained.at(-1).at(-1), allocationMiB - 1);
    clearTimeout(timeout);
    console.log('MEMORY_PROBE_PASS ' + JSON.stringify({node:process.version, arch:process.arch, budget,
        allocationMiB, heapLimitMiB, heapUsedMiB:process.memoryUsage().heapUsed / MiB,
        rssMiB:process.memoryUsage().rss / MiB}));
    process.exit(0);
});
bridge.send('memory-probe-ready');
