'use strict';
const { clock, jog, step: validateStep } = require('./protocol.cjs');
const { Adaptive }=require('./adaptive.cjs');
// No new CNC port/socket owner: observe the already-open upstream controller.
class Controller {
    constructor(getControllers, onFault, now = clock) {
        this.getControllers = getControllers; this.onFault = onFault; this.now = now;
        this.current = null; this.statusAt = -Infinity; this.serial = 0; this.owned = false;
        this.active = null; this.queue = []; this.listeners = []; this.internal = false;
        this.dropped = 0;
        this.mode='step';this.wake=()=>{};this.cancelAt=-Infinity;this.cancelSerial=0;
        this.cancelPending=0;this.cancelFailed=false;
        this.cancelTransport=null;
        this.adaptive=new Adaptive({now,snapshot:()=>this.snapshot(),
            submitStep:e=>this.submit(e,this.preset),tickStep:()=>this.tickStep(),
            stopStep:()=>this.stopStep(),cancel:()=>this.cancelMotion(),limits:i=>this.limits(i),
            takeStep:e=>this.takeStep(e),
            receiptsDrained:()=>!this.cancelPending,
            send:line=>this.current.writeln(line,{usbPendant:true},true)});
    }
    sync() {
        const all = Object.values(this.getControllers() || {}).filter(c => c?.isOpen?.());
        const next = all.length === 1 && /^(grbl|grblhal)$/i.test(all[0].type) ? all[0] : null;
        if (next === this.current) return;
        this.onFault('CNC connection changed; arm again explicitly');
        this.detach(); this.current = next; this.statusAt = -Infinity;
        if (!next) return;
        // Reconnecting only the knob must not erase uncertainty on the still-open
        // CNC transport. A new board connection can start a new receipt history.
        const transport=next.connection?.connection?.port;
        if(transport!==this.cancelTransport){
            this.cancelPending=0;this.cancelFailed=false;
            this.cancelAt=-Infinity;this.cancelSerial=0;
            this.cancelTransport=transport;
        }
        const listen = (emitter, event, fn, first=false) => { if(first)emitter.prependListener(event,fn);else emitter.on(event, fn); this.listeners.push(() => emitter.removeListener(event, fn)); };
        // Runner emits EVERY real status, even when coordinates do not change.
        listen(next.runner, 'status', () => { this.statusAt = this.now(); this.serial++; this.wake(); });
        for (const e of ['error', 'alarm', 'startup']) listen(next.runner, e, () => this.onFault('CNC ' + e));
        listen(next.connection, 'close', () => this.onFault('CNC disconnected'));
        listen(next.connection, 'error', () => this.onFault('CNC communication error'));
        listen(next.runner, 'ok', reply => {
            if(reply?.raw==='force ok' || next.actionMask?.queryParserState?.reply &&
                (!next.parserStateEnabled || next.actionMask.replyParserState))return;
            if(this.cancelPending){this.cancelPending--;this.wake();return;}
            if (this.active) this.active.acked = true;
            this.adaptive.ack();this.wake();
        },true);
        // Other UI commands take precedence. Disarm BEFORE a job/jog/macro starts.
        this.original = next.command;
        const self = this;
        this.wrapper = function(cmd, ...args) {
            if (!self.internal && self.owned && cmd !== 'statusreport') self.onFault('gSender control used; knob disarmed');
            return self.original.call(this, cmd, ...args);
        };
        next.command = this.wrapper;
    }
    detach() {
        this.stop();
        for (const off of this.listeners) off();
        this.listeners = [];
        if (this.current && this.current.command === this.wrapper) this.current.command = this.original;
        this.current = null;
    }
    call(cmd, ...args) {
        if (!this.current?.isOpen()) throw Error('No CNC connection');
        this.internal = true;
        try { return this.current.command(cmd, ...args); } finally { this.internal = false; }
    }
    snapshot() {
        const c = this.current, status = c?.runner?.state?.status;
        const setting = c?.settings?.settings?.['$13'];
        const known = String(setting) === '0' || String(setting) === '1';
        const factor = String(setting) === '1' ? 25.4 : 1;
        const xyz = ['x', 'y', 'z'].map(a => {
            const raw = status?.mpos?.[a];
            return typeof raw === 'number' || typeof raw === 'string' && raw.trim() !== '' ? Number(raw) * factor : NaN;
        });
        const valid = !!(c?.isOpen() && known && this.now() - this.statusAt >= 0 && this.now() - this.statusAt < 750 && xyz.every(n => Number.isFinite(n) && Math.abs(n) <= 99999.999));
        const state = valid ? String(status.activeState).toUpperCase() : 'NO_CNC_DATA';
        const f = c?.feeder?.toJSON();
        const empty = f?.hold === false && f.pending === false && f.queue === 0;
        const stream = c?.connection?.connection?.port;
        const transportEmpty = !!(stream?.isOpen && stream.writableLength === 0 && !stream.writableCorked && typeof stream.writeBounded === 'function');
        const idle = c?.workflow?.state === 'idle';
        const rotary = c?.isInRotaryMode === true;
        return { xyz, valid, state, empty, transportEmpty, idle, rotary, serial: this.serial, port: c?.options?.port || null };
    }
    limits(index){
        const p=this.preset,settings=this.current?.settings?.settings;
        const maximum=Number(settings?.['$'+(110+index)]),acceleration=Number(settings?.['$'+(120+index)]);
        if(!Number.isFinite(maximum)||maximum<=0||!Number.isFinite(acceleration)||acceleration<=0)throw Error('Adaptive mode needs axis maximum feed and acceleration settings');
        return {precision:Math.min(p.feedrate,maximum),feed:Math.min(p.rapidFeedrate??p.feedrate,maximum),acceleration};
    }
    canArm() { const s = this.snapshot(); return s.valid && s.state === 'IDLE' && s.empty && s.transportEmpty && s.idle && !s.rotary &&
        !this.cancelFailed && !this.cancelPending && (this.cancelAt===-Infinity || this.statusAt>=this.cancelAt+100 && s.serial>this.cancelSerial); }
    wheel(event,preset){this.preset=preset;if(this.owned && this.mode==='adaptive')this.adaptive.input(event);}
    submit(event, preset) {
        if (!this.owned) { this.dropped++; return false; }
        if (event.stepUm !== undefined && !validateStep(event.stepUm)) return false;
        this.expire();
        // Changing axis, direction or distance discards unsent old turns.
        const last = this.queue.at(-1);
        if (last && (last.axis !== event.axis || last.direction !== event.direction || last.stepUm !== event.stepUm)) {
            this.clearQueue();
            // Adaptive cancellation requires a new turn after the Idle barrier.
            // Do not enqueue the turn that initiated that cancellation.
            if (this.mode === 'adaptive' && this.adaptive.phase === 'stopping') {
                this.dropped++;
                return false;
            }
        }
        if (this.queue.length >= 8) { this.dropped++; return false; }
        this.queue.push({ ...event, preset: { ...preset }, at: this.now() });
        return true;
    }
    clearQueue() { this.dropped += this.queue.length; this.queue = []; if(this.mode==='adaptive')this.adaptive.halt(); }
    expire() {
        const count = this.queue.length, now = this.now();
        this.queue = this.queue.filter(e => now - e.at >= 0 && now - e.at < 200 && (e.queueDeadline === undefined || now < e.queueDeadline));
        this.dropped += count - this.queue.length;
    }
    tick() {
        if (!this.owned) return;
        const s=this.snapshot();
        if(!s.valid || !s.idle || s.rotary || !['IDLE','JOG'].includes(s.state))throw Error('CNC no longer permits jogging');
        if(this.mode==='adaptive')return this.adaptive.tick(s);
        return this.tickStep();
    }
    tickStep() {
        const s = this.snapshot(), now = this.now();
        this.expire();
        if (!s.valid || !s.idle || s.rotary || !['IDLE', 'JOG'].includes(s.state)) throw Error('CNC no longer permits jogging');
        if (this.active) {
            const a = this.active;
            const arrived = s.xyz.every((n, i) => Math.abs(n - a.target[i]) <= a.tolerance);
            if (a.acked && s.serial > a.serial && s.state === 'IDLE' && arrived) this.active = null;
            else if (now - a.at >= a.timeout) throw Error('Jog endpoint not confirmed; never resend');
            else return;
        }
        if (!this.queue.length) return;
        if (s.state !== 'IDLE' || !s.empty) throw Error('Another command/jog is active');
        if (!s.transportEmpty) return; // Local detents can expire; never queue a motion write.
        const e = this.queue.shift();
        const command = jog(e.preset, e.axis, e.direction, e.stepUm);
        const step = e.stepUm === undefined ? (e.axis === 'Z' ? e.preset.zStep : e.preset.xyStep) : e.stepUm / 1000;
        const target = [...s.xyz]; target['XYZ'.indexOf(e.axis)] += e.direction * step;
        if (target.some(n => !Number.isFinite(n) || Math.abs(n) > 99999.999)) throw Error('Jog target out of pendant range');
        this.active = { at: now, serial: s.serial, target, origin:[...s.xyz], axis:e.axis, direction:e.direction,
            distance:step, feed:e.preset.feedrate, stepUm:e.stepUm,
            tolerance: Math.min(step / 4, .004), acked: false,
            timeout: Math.max(1500, step * 60000 / e.preset.feedrate + 1500) };
        // The same controller write path as upstream jogging, but a FINITE $J.
        // Never jog:start, never insert motion into gSender's feeder backlog.
        this.current.writeln(command, { usbPendant: true }, true);
    }
    stop() {
        this.owned = false;
        this.cancelPending+=this.adaptive.segments.filter(s=>!s.acked).length;
        try{this.stopStep();}catch{ /* Cancellation uncertainty blocks re-arm. */ }
        try{this.adaptive.stop();}catch{this.adaptive.reset();}
    }
    takeStep(e){
        const a=this.active;
        // Only transfer ownership of a same-axis/direction exact jog. The
        // already-issued command and its ACK must not be duplicated or lost.
        if(a && (a.axis!==e.axis || a.direction!==e.direction || a.stepUm!==e.stepUm))return {blocked:true};
        this.dropped+=this.queue.length;this.queue=[];
        if(!a)return null;
        this.active=null;
        return {origin:a.origin,segment:{...a},feed:a.feed,at:a.at};
    }
    cancelMotion(){this.cancelAt=this.now();this.cancelSerial=this.serial;try{this.call('jog:stop');}catch(e){this.cancelFailed=true;throw e;}}
    stopStep(){
        this.queue=[];
        const hadMove = !!this.active;
        if(this.active && !this.active.acked)this.cancelPending++;
        this.active = null;
        if (hadMove && this.current?.isOpen()) {
            this.cancelMotion();
        }
        return hadMove;
    }
}
module.exports = { Controller };
