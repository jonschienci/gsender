// Keep display histories bounded even if the main thread or hidden view stalls.
export function createLineBuffer(consume, {limit = 300, delay = 100, timers = globalThis, active = true} = {}) {
    let lines = [], timer = null;
    const flush = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        if (!active || !lines.length) return;
        const batch = lines; lines = []; consume(batch);
    };
    const schedule = () => { if (active && timer === null && lines.length) timer = timers.setTimeout(flush, delay); };
    return {
        push(line) { lines.push(line); if (lines.length > limit) lines.splice(0, lines.length-limit); schedule(); },
        flush,
        setActive(value) { active = value; if (active) flush(); },
        dispose() { if (timer !== null) timers.clearTimeout(timer); timer = null; lines = []; },
    };
}

// Coalesce only position/progress counters, with immediate barriers for machine
// state, pin, modal, alarm, hold, completion and connection changes.
function stateKey(event, args) {
    if (event === 'controller:state') {
        const [type, state, ...rest] = args;
        const {wpos, mpos, ...status} = state?.status || {};
        return JSON.stringify([type, {...state, status}, ...rest]);
    }
    if (event === 'sender:status') {
        const {sent, received, elapsedTime, timeRunning, remainingTime,
            currentLineRunning, dataLength, ...other} = args[0] || {};
        return JSON.stringify([other, sent === 0, received === 0, ...args.slice(1)]);
    }
    return null;
}
export function createDisplayScheduler(deliver, timers = globalThis) {
    const pending = new Map(), keys = new Map();
    let frame = null, timeout = null;
    const flush = () => {
        if (frame !== null) timers.cancelAnimationFrame?.(frame);
        if (timeout !== null) timers.clearTimeout(timeout);
        frame = timeout = null;
        const entries = [...pending]; pending.clear();
        for (const [event, args] of entries) deliver(event, ...args);
    };
    return {
        receive(event, args) {
            const key = stateKey(event, args);
            if (key !== null && keys.get(event) === key) {
                // Reinserting maintains the order of the latest snapshots.
                pending.delete(event); pending.set(event, args);
                if (timeout === null) {
                    timeout = timers.setTimeout(flush, 50);
                    if (timers.requestAnimationFrame) frame = timers.requestAnimationFrame(flush);
                }
                return;
            }
            if (event !== 'serialport:read' || /^(?:error:|ALARM:)/i.test(String(args[0]).trim())) flush();
            if (key !== null) keys.set(event, key);
            if (event === 'serialport:close' || event === 'disconnect') keys.clear();
            deliver(event, ...args);
        },
        dispose() { if (frame !== null) timers.cancelAnimationFrame?.(frame); if (timeout !== null) timers.clearTimeout(timeout); frame = timeout = null; pending.clear(); keys.clear(); },
    };
}
