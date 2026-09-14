'use strict';
// P2 is paired with the STEP-editor ESP release, not the legacy P1 Mac bridge.
const { randomBytes } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const clock = () => performance.now();
const MAX = 2147483647;
function integer(s, lo, hi) {
    if (!/^-?\d+$/.test(s)) throw Error('Invalid protocol integer');
    const n = Number(s);
    if (!Number.isSafeInteger(n) || n < lo || n > hi) throw Error('Protocol integer out of range');
    return n;
}
function hello(line) {
    const m = /^P2 HELLO ([a-f0-9]{16}) 2 ([01]) ([01])$/.exec(line);
    if (!m || m[3] !== '0') throw Error('Expected healthy P2 STEP firmware; old/BENCH firmware cannot jog');
    return m[1];
}
class Lines {
    constructor() { this.buffer = ''; }
    feed(bytes) {
        const out = [];
        for (const b of bytes) {
            if (b === 10) { if (this.buffer) out.push(this.buffer.replace(/\r$/, '')); this.buffer = ''; }
            else if ((b === 13 || b >= 32 && b <= 126) && this.buffer.length < 256) this.buffer += String.fromCharCode(b);
            else throw Error('Oversized/non-ASCII USB input');
        }
        return out;
    }
}
class Gate {
    constructor(boot, now = clock) {
        this.boot = boot; this.now = now; this.session = randomBytes(16).toString('hex');
        this.ticket = 0; this.sequence = 0; this.tickets = new Map(); this.ready = false; this.aliveAt = -Infinity;
        this.stepUm = 500; this.selection = 0; this.dropped = 0;
    }
    healthy() { return this.ready && this.now() - this.aliveAt >= 0 && this.now() - this.aliveAt < 500; }
    revoke() { for (const t of this.tickets.values()) t.armed = false; }
    state(xyz, valid, status, arm = false) {
        if (++this.ticket > MAX) throw Error('USB ticket exhausted');
        valid = valid && xyz.length === 3 && xyz.every(n => Number.isFinite(n) && Math.abs(n) <= 99999.999);
        for (const [id, t] of this.tickets) if (this.now() - t.at >= 2000) this.tickets.delete(id);
        const armed = !!(arm && valid && this.healthy());
        this.tickets.set(this.ticket, { at: this.now(), armed, stepUm: this.stepUm });
        const um = valid ? xyz.map(n => Math.round(n * 1000)) : [0, 0, 0];
        const label = String(status).toUpperCase().replace(/[^A-Z_]/g, '_').slice(0, 17) || 'UNKNOWN';
        return `P2 STATE ${this.session} ${this.ticket} ${+!!valid} ${+armed} ${um.join(' ')} ${label} ${this.stepUm}\n`;
    }
    receive(line) {
        if (line.startsWith('P2 HELLO ')) {
            if (hello(line) !== this.boot) throw Error('ESP rebooted; reconnect and re-arm manually');
            return;
        }
        const p = line.split(' '), alive = p[1] === 'ALIVE';
        if (p[0] !== 'P2' || (!alive && p[1] !== 'DETENT') || p.length !== 9 || p[2] !== this.boot || p[3] !== this.session)
            throw Error('Invalid USB frame/session');
        const ticket = integer(p[alive ? 4 : 5], 1, MAX), issued = this.tickets.get(ticket);
        if (ticket > this.ticket || issued && this.now() - issued.at < 0) throw Error('Unissued USB ticket');
        const fresh = issued && this.now() - issued.at < 500;
        if (alive) {
            const ready = !!integer(p[5], 0, 1), selection = integer(p[7], 0, 3), stepUm = step(p[8]);
            if (integer(p[6], 0, 1)) throw Error('ESP fault');
            if (!fresh) return; // Late heartbeat must not renew the lease.
            this.ready = ready; this.selection = selection; this.stepUm = stepUm;
            this.aliveAt = this.now(); return;
        }
        const seq = integer(p[4], 1, MAX);
        const stepUm = step(p[8]);
        if (!/^[XYZ]$/.test(p[6]) || !/^(-1|1)$/.test(p[7])) throw Error('Invalid detent');
        if (seq <= this.sequence) return; // Duplicate: never repeat a move.
        if (seq !== this.sequence + 1) throw Error('Missing/out-of-order detent');
        this.sequence = seq;
        // Turns already in USB at disarm/setting changes are discarded, never
        // replayed and never treated as a reason to close a healthy connection.
        if (!fresh || !issued.armed || !this.healthy() || this.selection === 3 || !stepUm || stepUm !== issued.stepUm || stepUm !== this.stepUm) { this.dropped++; return; }
        return { axis: p[6], direction: Number(p[7]), stepUm };
    }
}
function step(value) {
    const n = integer(value, 0, 10000);
    if (n % 100) throw Error('STEP must be in 0.1 mm increments');
    return n;
}
function precision(value) {
    const { xyStep, zStep, feedrate } = value || {};
    if (![xyStep, zStep, feedrate].every(Number.isFinite) || xyStep < 0 || xyStep > 10 || zStep < 0 || zStep > 10 || feedrate < 1 || feedrate > 1000)
        throw Error('Precision requires 0–10 mm steps and 1–1000 mm/min; the knob STEP sets its own distance');
    return Object.freeze({ xyStep, zStep, feedrate });
}
function jog(p, axis, direction, stepUm) {
    if (!/^[XYZ]$/.test(axis) || ![-1, 1].includes(direction)) throw Error('Invalid jog');
    precision(p);
    const distance = stepUm === undefined ? (axis === 'Z' ? p.zStep : p.xyStep) : step(stepUm) / 1000;
    if (!distance) throw Error('Zero STEP must not issue motion');
    return `$J=G21G91 ${axis}${(direction * distance).toFixed(4)} F${p.feedrate.toFixed(3)}`;
}
module.exports = { Lines, Gate, hello, precision, jog, step, clock };
