'use strict';
// Equivalent to split('\n').filter(line => line.trim()).length without a line array.
const whitespace = c => c === 32 || (c >= 9 && c <= 13) || c === 160 || c === 5760 ||
    (c >= 8192 && c <= 8202) || c === 8232 || c === 8233 || c === 8239 || c === 8287 || c === 12288 || c === 65279;
export const createLineCounter = text => {
    let offset = 0, count = 0, nonblank = false;
    return (maxChars = 32768) => {
        const end = Math.min(text.length, offset + maxChars);
        for (; offset < end; offset++) {
            const c = text.charCodeAt(offset);
            if (c === 10) { if (nonblank) count++; nonblank = false; }
            else if (!nonblank && !whitespace(c)) nonblank = true;
        }
        const done = offset === text.length;
        return {done, count:count + (done && nonblank ? 1 : 0)};
    };
};
export const scheduleLineCount = (text, complete, schedule, cancel = clearTimeout) => {
    let channel;
    if (!schedule && typeof MessageChannel !== 'undefined') {
        // Posted tasks yield to input without the nested setTimeout 4 ms clamp.
        channel = new MessageChannel();
        let pending;
        channel.port1.onmessage = () => { const fn = pending; pending = null; fn?.(); };
        schedule = fn => { pending = fn; channel.port2.postMessage(0); return 0; };
        cancel = () => { pending = null; channel.port1.close(); channel.port2.close(); };
    }
    schedule ||= fn => setTimeout(fn, 0);
    const step = createLineCounter(text);
    let stopped = false, timer;
    const run = () => {
        if (stopped) return;
        const result = step();
        if (result.done) { if (channel) cancel(timer); complete(result.count); }
        else timer = schedule(run);
    };
    timer = schedule(run);
    return () => { stopped = true; cancel(timer); };
};
