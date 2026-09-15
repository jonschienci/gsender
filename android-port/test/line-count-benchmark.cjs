// Isolated Node benchmark; no controller/USB access.
const assert = require('node:assert/strict');
const {createLineCounter} = require(process.argv[2]);
const line='G1 X123.456 Y234.567 F1200\n';
const text=line.repeat(Math.floor(20*1024*1024/line.length));
const start=performance.now();
const previous=text.split('\n').filter(line=>line.trim()).length;
const previousMs=performance.now()-start;
const step=createLineCounter(text);let result,maxChunkMs=0,chunks=0;
const began=performance.now();
do {const time=performance.now();result=step();maxChunkMs=Math.max(maxChunkMs,performance.now()-time);chunks++;} while(!result.done);
assert.equal(result.count,previous);
console.log('LINE_COUNT_BENCH '+JSON.stringify({node:process.version,platform:process.platform,inputMiB:text.length/1024/1024,lines:previous,previousBlockingMs:Math.round(previousMs),newComputeMs:Math.round(performance.now()-began),maxChunkMs:+maxChunkMs.toFixed(2),chunks}));
