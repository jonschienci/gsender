'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JobLines} = require('../runtime/job-lines.cjs');
const {transform} = require('../scripts/job-memory.cjs');
const filename = path.resolve(__dirname, '../../src/server/lib/Sender.js');
const source = fs.readFileSync(filename, 'utf8');
function senderClass(optimized) {
    let code = optimized ? transform(source, filename) : source;
    code = code.replace(/^import .*;\n/gm, '').replaceAll('export const ', 'const ')
        .replace('export default Sender;', 'return Sender;');
    const rotary = new Function('gcode', fs.readFileSync(path.join(path.dirname(filename), 'rotary.js'), 'utf8')
        .replace('export const checkIfRotaryFile = (gcode) => {', '').replace(/};\s*$/, ''));
    return new Function('events', 'logger', 'checkIfRotaryFile', 'JobLines', code)(
        require('node:events'), () => ({debug(){}}), rotary, JobLines);
}
test('indexed lines exactly match split/filter including CRLF, Unicode whitespace and chunk boundaries', () => {
    const whitespace = Array.from({length:65536}, (_, n) => String.fromCharCode(n))
        .filter(c => c !== '\n' && c.trim() === '').join('');
    const lines = ['', ' ', whitespace, '(A in comment)', ';comment', '\r', 'G1 X2\r', '\u200b', '\0', 'M30'];
    let seed = 739;
    for (let i = 0; i < 70000; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        lines.push(seed % 4 === 0 ? whitespace : ` ${seed % 2 ? 'G2 X3 I1' : 'G1 X2 Y5'} ;${seed}\r`);
    }
    for (const text of ['', '\n\n', 'G1 X1', lines.join('\n') + '\n']) {
        const expected = text.split('\n').filter(line => line.trim().length > 0);
        const actual = new JobLines(text);
        assert.equal(actual.length, expected.length);
        assert.equal(actual.byteLength, expected.length * 8);
        for (let i = expected.length - 1; i >= 0; i--) assert.equal(actual.get(i), expected[i]);
        assert.equal(actual.get(-1), undefined);
        assert.equal(actual.get(actual.length), undefined);
    }
});
for (const type of [0, 1]) {
    test(`real Sender protocol ${type}: identical bytes, filtering, hold/resume, start line and rewind`, () => {
        const text = Array.from({length:3000}, (_, i) => i % 13 === 0 ? ' \t\r' :
            i % 17 === 0 ? ';filtered comment' : `G1 X${i} Y${i % 100}\r`).join('\n');
        function run(optimized) {
            const Sender = senderClass(optimized), output = [], filters = [];
            const s = new Sender(type, {bufferSize:128, dataFilter(line) {
                filters.push(line); return line.startsWith(';') ? '' : line;
            }});
            s.on('data', value => output.push(value));
            assert.equal(s.load('fixture.nc', text), true);
            function drain() {
                s.sp.process(false);
                let acknowledged = 0;
                while (acknowledged < output.length) {
                    const pausedAt = output.length;
                    s.hold(); s.sp.process(false);
                    assert.equal(output.length, pausedAt);
                    s.unhold(); s.ack(); acknowledged++; s.sp.process(true);
                }
                assert.equal(s.state.sent, s.state.total);
                assert.equal(s.state.received, s.state.total);
            }
            // Direct protocol calls avoid starting elapsed-time timers in this host test.
            s.setStartLine(27); drain();
            const resumed = output.splice(0); const filtered = filters.splice(0);
            assert.equal(s.rewind(), true); drain();
            const total = s.state.total;
            s.unload(); assert.equal(s.state.lines.length, 0); assert.equal(s.state.gcode, '');
            assert.equal(s.load('next.nc', 'M30'), true);
            assert.equal(s.state.total, 1);
            return {resumed, output, filtered, filters, total};
        }
        assert.deepEqual(run(true), run(false));
    });
}
test('Android adapter refuses unexpected upstream storage changes', () => {
    assert.throws(() => transform(source.replace('this.state.lines[this.state.sent]', 'newStorage'), filename));
    assert.equal(transform('untouched', '/src/server/elsewhere.js'), 'untouched');
});
