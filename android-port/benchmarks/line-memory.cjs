// Host-only microbenchmark, not an Android/end-to-end job result.
// node --expose-gc android-port/benchmarks/line-memory.cjs [20|100]
'use strict';
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const MiB = 1024 * 1024;
const size = Number(process.argv[2] || 20);
assert.ok(Number.isInteger(size) && size > 0 && size <= 100);
if (!process.argv[3]) {
    const results = ['array', 'index'].map(mode => {
        const p = spawnSync(process.execPath, ['--expose-gc', __filename, size, mode], {encoding:'utf8'});
        assert.equal(p.status, 0, p.stderr);
        return JSON.parse(p.stdout);
    });
    assert.equal(results[0].lines, results[1].lines);
    assert.equal(results[0].sha256, results[1].sha256);
    console.log(JSON.stringify({hostOnly:true, node:process.version, results}, null, 2));
} else {
    const {JobLines} = require('../runtime/job-lines.cjs');
    const line = ' G1 X123.456 Y234.567 Z-1.000 F1200\r\n';
    const raw = line.repeat(Math.floor(size * MiB / line.length));
    Buffer.byteLength(raw); raw.charCodeAt(raw.length - 1); // Materialize before baseline.
    global.gc();
    const before = process.memoryUsage();
    const started = performance.now();
    const mode = process.argv[3];
    const lines = globalThis.kept = mode === 'index' ? new JobLines(raw) : raw.split('\n').filter(l => l.trim().length > 0);
    const loadMs = performance.now() - started;
    global.gc();
    const after = process.memoryUsage();
    const hash = createHash('sha256'), streamStarted = performance.now();
    for (let i = 0; i < lines.length; i++) hash.update((mode === 'index' ? lines.get(i) : lines[i]).trim() + '\n');
    console.log(JSON.stringify({mode, inputMiB:raw.length / MiB, lines:lines.length, loadMs,
        storageMiB:(after.heapUsed + after.arrayBuffers - before.heapUsed - before.arrayBuffers) / MiB,
        streamMs:performance.now() - streamStarted, sha256:hash.digest('hex')}));
}
