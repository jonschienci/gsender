const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createLineCounter, scheduleLineCount} = require('../ui/line-count.mjs');

test('incremental line count matches upstream whitespace semantics across chunk boundaries', () => {
    const cases = ['', '\n\n', 'G0 X1\nG1 X2', ' \t\r\n ;comment\nM5\n', '\u00a0\u2000\u2028\uFEFF\nG1\n\u0085', 'X'.repeat(100000)];
    for (let i=0;i<30;i++) cases.push((' \t\r\nG1 X'+i+'\n\n ; hi \n').repeat(i));
    for (const text of cases) for (const size of [1, 7, 32768]) {
        const step = createLineCounter(text); let result;
        do {result=step(size);} while(!result.done);
        assert.equal(result.count, text.split('\n').filter(line=>line.trim()).length);
    }
});
test('large-file fallback yields to input and cancellation cannot publish stale counts', () => {
    const queue = new Map();let next=0, count;
    const schedule = fn => {queue.set(++next,fn);return next;};
    const cancel = id => queue.delete(id);
    const stop = scheduleLineCount('G1 X1\n'.repeat(200000), value=>{count=value;},schedule,cancel);
    const first=queue.entries().next().value;queue.delete(first[0]);first[1]();
    assert.equal(count,undefined);assert.equal(queue.size,1,'Must yield before scanning all text');
    stop();assert.equal(queue.size,0);assert.equal(count,undefined);
    scheduleLineCount('G1\n \nM5\n', value=>{count=value;},schedule,cancel);
    for(const [id,fn] of queue) {queue.delete(id);fn();}
    assert.equal(count,2);
});
