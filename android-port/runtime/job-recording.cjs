'use strict';
// Passive diagnostics only: never calls controller.command/write or changes workflow.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const ID = /^[a-f0-9-]{36}$/;
const text = v => String(v ?? '').slice(0, 512);
const bounded = value => { const s = JSON.stringify(value); return s && s.length <= 16384 ? JSON.parse(s) : { omitted: 'Oversized sample' }; };

class Journal {
    constructor(dir, summary, { io = fs.promises, maxBytes = 8 * 1024 * 1024, maxQueue = 256 * 1024, ready = Promise.resolve() } = {}) {
        Object.assign(this, { dir, summary, io, maxBytes, maxQueue, ready });
        this.queue = []; this.queued = 0; this.bytes = 0; this.dropped = 0;
        this.dirty = true; this.writing = null; this.failed = null;
    }
    add(event, data = {}) {
        if (this.failed) return;
        const line = JSON.stringify({ time: Date.now(), event, ...data }) + '\n';
        const size = Buffer.byteLength(line);
        if (size > 32768 || this.queued + size > this.maxQueue || this.bytes + size > this.maxBytes) { this.dropped++; return; }
        this.queue.push(line); this.queued += size; this.bytes += size;
    }
    flush() {
        this.dirty = true;
        if (this.writing || this.failed) return this.writing;
        this.writing = (async () => {
            try {
                await this.ready;
                await this.io.mkdir(this.dir, { recursive: true });
                do {
                    this.dirty = false;
                    const batch = this.queue.join(''); this.queue = []; this.queued = 0;
                    if (batch) await this.io.appendFile(path.join(this.dir, 'events.ndjson'), batch);
                    const summary = { ...this.summary, logBytes: this.bytes, droppedRecords: this.dropped };
                    await this.io.writeFile(path.join(this.dir, 'summary.json.tmp'), JSON.stringify(summary));
                    await this.io.rename(path.join(this.dir, 'summary.json.tmp'), path.join(this.dir, 'summary.json'));
                } while (this.dirty || this.queue.length);
            } catch (error) { this.failed = text(error.message); this.queue = []; this.queued = 0; }
            finally { this.writing = null; }
        })();
        return this.writing;
    }
}

class Recorder {
    constructor({ root, build = 'development', io = fs.promises, now = Date.now, simulation = () => false, interval = 5000, journalOptions = {} }) {
        Object.assign(this, { root, build, io, now, simulation, interval, journalOptions });
        this.run = null; this.error = null; this.ending = new Set();
        this.ready = this.recover().catch(error => { this.error = text(error.message); });
    }
    async recover() {
        await this.io.mkdir(this.root, { recursive: true });
        for (const id of (await this.io.readdir(this.root)).filter(id => ID.test(id))) {
            try {
                const file = path.join(this.root, id, 'summary.json');
                const summary = JSON.parse(await this.io.readFile(file, 'utf8'));
                if (summary.status === 'recording') {
                    summary.status = 'interrupted'; summary.reason = 'App exited without closing the job log'; summary.recovered = this.now();
                    await this.io.writeFile(file, JSON.stringify(summary));
                }
            } catch { /* A partial first write is not a valid report. */ }
        }
        await this.prune(12);
    }
    async list() {
        await this.ready;
        const items = [];
        for (const id of (await this.io.readdir(this.root)).filter(id => ID.test(id))) {
            try { items.push(JSON.parse(await this.io.readFile(path.join(this.root, id, 'summary.json'), 'utf8'))); } catch { }
        }
        return items.sort((a, b) => b.started - a.started);
    }
    async prune(keep) {
        const items = [];
        for (const id of (await this.io.readdir(this.root)).filter(id => ID.test(id))) {
            try { items.push({ id, time: (await this.io.stat(path.join(this.root, id))).mtimeMs }); } catch { }
        }
        items.sort((a, b) => b.time - a.time);
        for (const item of items.slice(keep)) if (item.id !== this.run?.summary.id && !this.ending.has(item.id)) await this.io.rm(path.join(this.root, item.id), { recursive: true, force: true });
    }
    snapshot(c) {
        const sender = c.sender?.state || {}, status = c.runner?.state?.status || c.state?.status || {};
        return bounded({ workflow: c.workflow?.state, sender: { sent: sender.sent, received: sender.received, total: sender.total, hold: sender.hold, holdReason: sender.holdReason },
            machine: status, modal: c.runner?.state?.parserstate?.modal, senderBufferBytes: c.sender?.sp?.dataLength,
            transportQueuedBytes: c.connection?.connection?.port?.writableLength });
    }
    start(c) {
        if (this.simulation() || this.error) return;
        if (this.run?.controller === c) { this.run.journal.add('start_requested_again'); return; }
        if (this.run) this.finish('interrupted', 'Another controller started a job');
        const id = randomUUID(), started = this.now(), meta = c.engine?.meta || {};
        const summary = { schema: 1, id, build: this.build, started, status: 'recording', kind: 'physical-job',
            file: { name: text(meta.name || c.sender?.state?.name), bytes: meta.size, lines: c.sender?.state?.total },
            port: text(c.options?.port), firmwareType: text(c.type), scope: 'Passive host observations. TX is a write attempt; ACK is acceptance, not completed motion. Timing samples are not physical input latency.' };
        const journal = new Journal(path.join(this.root, id), summary, { io: this.io, ready: this.ready, ...this.journalOptions });
        const run = { controller: c, connection: c.connection, summary, journal, recent: [], counts: { tx: 0, rx: 0, ok: 0, errors: 0, alarms: 0 },
            first: 0, lastReply: started, lastProgress: started, progress: -1, lastWarning: 0, cpu: process.cpuUsage() };
        this.run = run;
        journal.add('job_start', { snapshot: this.snapshot(c), firmware: bounded(c.settings?.info || {}), settings: bounded(c.settings?.settings || {}) });
        this.ready.then(async () => { if (this.error) { journal.failed = this.error; return; } await this.prune(11); await journal.flush(); }).catch(error => { journal.failed = text(error.message); });
        // Incremental hashing avoids a full-file copy or a long synchronous hash at Start.
        const gcode = c.engine?.gcode;
        if (typeof gcode === 'string') {
            const hash = createHash('sha256'); let index = 0;
            const step = () => {
                let end = Math.min(index + 65536, gcode.length);
                if (end < gcode.length && /[\uD800-\uDBFF]/.test(gcode[end - 1])) end--;
                hash.update(gcode.slice(index, end)); index = end;
                if (index < gcode.length) { if (this.run === run) setImmediate(step); }
                else { summary.file.sha256 = hash.digest('hex'); journal.flush(); }
            };
            setImmediate(step);
        }
        run.lag = monitorEventLoopDelay({ resolution: 20 }); run.lag.enable();
        if (this.interval) { run.timer = setInterval(() => this.safely(() => this.sample()), this.interval); run.timer.unref?.(); }
    }
    safely(fn) { try { return fn(); } catch (error) { this.error = text(error.message); } }
    wire(connection, direction, data, context) {
        const run = this.run;
        if (!run || run.connection !== connection || run.journal.failed) return;
        const line = text(data), time = this.now();
        run.counts[direction]++;
        if (direction === 'rx') {
            run.lastReply = time;
            if (/^ok\s*$/.test(line)) run.counts.ok++;
            if (/^error:/i.test(line)) run.counts.errors++;
            if (/^ALARM:/i.test(line)) run.counts.alarms++;
            if (line.startsWith('<')) { run.lastStatus = { time, line }; return; }
        }
        if (direction === 'tx' && ['?', '\x80', '\x87'].includes(line)) return;
        const record = { time, direction, line, source: context?.source };
        run.recent.push(record); if (run.recent.length > 64) run.recent.shift();
        const critical = /^(error:|ALARM:|Grbl|\[MSG:)/i.test(line) || /[\x18\x19\x85!~]/.test(line);
        if (run.first++ < 128 || critical) { run.journal.add('wire', record); if (critical) run.journal.flush(); }
    }
    observe(c, event, args) {
        if (event === 'job:start') this.start(c);
        const run = this.run; if (!run || run.controller !== c) return;
        if (['workflow:state', 'job:stop', 'sender:M0M1', 'toolchange:start', 'toolchange:preHookComplete'].includes(event)) {
            run.journal.add(event, { value: bounded(args), snapshot: this.snapshot(c) }); run.journal.flush();
            if (event === 'workflow:state' && args[0] === 'idle') this.finish('ended', 'Workflow stopped (see final machine state and sender counters)');
        }
    }
    command(c, cmd) {
        if (this.run?.controller === c && /^(gcode:(start|stop|pause|resume)|reset|jog:(stop|cancel))/.test(cmd)) {
            this.run.journal.add('command_requested', { command: text(cmd), snapshot: this.snapshot(c) });
        }
    }
    sample() {
        const run = this.run; if (!run) return;
        const snapshot = this.snapshot(run.controller), now = this.now(), cpu = process.cpuUsage();
        if (snapshot.sender.received !== run.progress) { run.progress = snapshot.sender.received; run.lastProgress = now; }
        const data = { snapshot, counts: { ...run.counts }, recent: run.recent.splice(0), lastStatus: run.lastStatus,
            sinceReplyMs: now - run.lastReply, sinceSenderProgressMs: now - run.lastProgress, memory: process.memoryUsage(),
            cpuUserMicros: cpu.user - run.cpu.user, cpuSystemMicros: cpu.system - run.cpu.system,
            eventLoopP95Ms: run.lag.percentile(95) / 1e6, eventLoopMaxMs: run.lag.max / 1e6 };
        run.cpu = cpu; run.lag.reset(); run.summary.latest = data; run.summary.counts = { ...run.counts };
        run.journal.add('sample', data);
        if (snapshot.workflow === 'running' && snapshot.sender.sent > snapshot.sender.received && now - run.lastProgress >= 10000 && now - run.lastWarning >= 30000) {
            run.lastWarning = now; run.journal.add('sender_waiting', { pending: snapshot.sender.sent - snapshot.sender.received, note: 'Observation only: may be a dwell, spindle wait, pause or lost acknowledgement.' });
        }
        run.journal.flush();
    }
    finish(status, reason) {
        const run = this.run; if (!run) return;
        this.sample(); this.run = null; clearInterval(run.timer); run.lag.disable();
        Object.assign(run.summary, { status, reason: text(reason), ended: this.now() });
        run.journal.add('job_log_end', { status, reason: text(reason) });
        this.ending.add(run.summary.id);
        run.journal.flush()?.finally(() => this.ending.delete(run.summary.id));
    }
    disconnected(connection, reason) { if (this.run?.connection === connection) this.finish('disconnected', reason || 'Transport closed'); }
    native(id, sample) {
        const run = this.run;
        if (!run || id !== run.summary.id || (run.nativeAt && this.now() - run.nativeAt < 4000)) return false;
        run.nativeAt = this.now(); const value = bounded(sample);
        run.summary.device = value.native; run.journal.add('ui_sample', value); return true;
    }
    status() { return { active: this.run ? { id: this.run.summary.id, build: this.build } : null, error: this.error || this.run?.journal.failed || null }; }
    async report(id) {
        if (!ID.test(id)) throw Error('Invalid report ID');
        await this.ready;
        if (this.run?.summary.id === id) await this.run.journal.flush();
        const dir = path.join(this.root, id), summary = JSON.parse(await this.io.readFile(path.join(dir, 'summary.json'), 'utf8'));
        const lines = (await this.io.readFile(path.join(dir, 'events.ndjson'), 'utf8')).trim().split('\n').filter(Boolean);
        return { summary, events: lines.map(line => { try { return JSON.parse(line); } catch { return { event: 'incomplete_record' }; } }) };
    }
}
let recorder;
function get() {
    if (!recorder) recorder = new Recorder({ root: path.join(process.env.GSENDER_USER_DATA, 'job-logs'), build: JSON.parse(fs.readFileSync(path.join(__dirname, 'benchmark/build.json'), 'utf8')).build, simulation: () => require('./benchmark/gate.cjs').state.active });
    return recorder;
}
const safe = fn => { try { return get().safely(() => fn(get())); } catch { /* Logging must never interrupt CNC processing. */ } };
exports.event = (c, event, ...args) => safe(r => r.observe(c, event, args));
exports.command = (c, cmd) => safe(r => r.command(c, cmd));
exports.wire = (c, direction, data, context) => safe(r => r.wire(c, direction, data, context));
exports.disconnected = (c, reason) => safe(r => r.disconnected(c, reason));
exports.installRoutes = app => {
    const express = require('express'); safe(() => {});
    app.get('/api/job-logs/status', (_req, res) => { res.set('Cache-Control', 'no-store').json(safe(r => r.status()) || { active: null, error: 'Logging unavailable' }); });
    app.get('/api/job-logs', async (_req, res) => { try { res.set('Cache-Control', 'no-store').json({ reports: await get().list(), ...get().status() }); } catch (e) { res.status(500).json({ error: text(e.message) }); } });
    app.get('/api/job-logs/report/:id', async (req, res) => { try { res.set('Cache-Control', 'no-store').json(await get().report(req.params.id)); } catch (e) { res.status(404).json({ error: text(e.message) }); } });
    app.post('/api/job-logs/sample', express.json({ limit: '16kb' }), (req, res) => {
        if (req.get('X-gSender-Job-Log') !== '1') return res.status(403).end();
        res.json({ recorded: safe(r => r.native(req.body?.id, req.body?.sample)) === true });
    });
};
exports.Recorder = Recorder; exports.Journal = Journal;
