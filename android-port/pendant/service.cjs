'use strict';
const path = require('node:path');
const { Lines, Gate, hello, precision, clock } = require('./protocol.cjs');
const { Controller } = require('./controller.cjs');
const isEsp = p => String(p.vendorId).toLowerCase() === '303a' && String(p.productId).toLowerCase() === '1001';
class Pendant {
    constructor({ SerialPort, getControllers, now = clock }) {
        this.SerialPort = SerialPort; this.now = now; this.gate = null; this.port = null;
        this.reason = 'Connect the ESP USB knob'; this.armed = false; this.connecting = false;
        this.generation = 0; this.pendingWrite = null; this.lastState = -Infinity; this.lastPoll = -Infinity;
        this.uiAt = -Infinity; this.uiSession = null; this.preset = null; this.openAt = 0;
        this.machine = new Controller(getControllers, reason => this.disarm(reason), now);
        this.mode='step';
        this.scheduled = false; this.ticking = false; this.lastStateKey = null;
        this.machine.wake = () => this.schedule();
    }
    schedule() {
        if (this.scheduled) return;
        this.scheduled = true; const generation = this.generation;
        // Run after the upstream runner finishes applying its status event.
        // Coalesce a USB burst; do not create one task per detent/status.
        queueMicrotask(() => {
            this.scheduled = false;
            if (generation === this.generation) this.tick();
        });
    }
    status() {
        return { connected: !!this.port?.isOpen, connecting: this.connecting, ready: !!this.gate?.healthy(),
            mode:this.mode,velocityReady:!!this.gate?.velocityReady(),adaptivePhase:this.machine.adaptive.phase,
            armed: this.armed, reason: this.reason, port: this.port?.path || null, preset: this.armed ? this.preset : this.uiPreset,
            stepMm: this.gate ? this.gate.stepUm / 1000 : null,
            selection: this.gate ? ['X','Y','Z','STEP'][this.gate.selection] : null,
            droppedTurns: this.machine.dropped + (this.gate?.dropped || 0), cnc: this.machine.snapshot() };
    }
    async connect() {
        if (this.port || this.connecting) throw Error('Disconnect the existing knob first');
        this.connecting = true; this.reason = 'Checking ESP native USB';
        const generation = ++this.generation;
        try {
            const all = await this.SerialPort.list(), matches = all.filter(isEsp);
            if (generation !== this.generation) return;
            if (matches.length !== 1) throw Error(`Expected one ESP native USB 303A:1001; found ${matches.length}`);
            // Native permission may take time. The Android adapter rejects duplicate opens.
            const p = new this.SerialPort({ path: matches[0].path, baudRate: 115200, autoOpen: false, dtr: false, rts: false, writeDeadlineMs: 250 });
            this.port = p; this.lines = new Lines(); this.gate = null;
            p.on('error', err => { if (this.port === p) this.disconnect('USB error: ' + err.message); });
            p.on('close', () => { if (this.port === p) this.disconnect('USB detached; reconnect and re-arm manually'); });
            p.on('data', bytes => {
                if (this.port !== p) return;
                try {
                    for (const line of this.lines.feed(bytes)) {
                        if (!this.gate) {
                            if (line.startsWith('B1 ') || line.startsWith('P1 ')) throw Error('Old/BENCH firmware installed; flash the P2 STEP build first');
                            if (!line.startsWith('P2 HELLO ')) continue; // Bounded startup window; ROM boot text only.
                            this.gate = new Gate(hello(line), this.now);
                            this.gateAt = this.now(); this.reason = 'Display only; waiting for handshake';
                        } else {
                            const step = this.gate.stepUm, selection = this.gate.selection;
                            const event = this.gate.receive(line);
                            if (step !== this.gate.stepUm || selection !== this.gate.selection) this.machine.clearQueue();
                            if (event && this.armed) {
                                if(this.mode==='adaptive'){
                                    if(event.isNew===undefined)throw Error('Untimed legacy detent in adaptive mode');
                                    this.machine.wheel(event,this.preset);
                                }
                                else if(event.isNew===undefined && event.direction)this.machine.submit(event, this.preset);
                            }
                        }
                    }
                    this.schedule();
                } catch (err) { this.disconnect(err.message); }
            });
            await new Promise((resolve, reject) => p.open(err => err ? reject(err) : resolve()));
            if (generation !== this.generation || this.port !== p) { p.destroy(); return; }
            this.openAt = this.now(); this.lastState = -Infinity; this.lastStateKey = null;
            // Ensure metadata still identifies the same endpoint after OS permission.
            const after = (await this.SerialPort.list()).find(d => d.path === p.path);
            if (!after || !isEsp(after) || matches[0].serialNumber && after.serialNumber !== matches[0].serialNumber)
                throw Error('USB identity changed while opening');
        } catch (err) { if (generation === this.generation) this.disconnect(err.message); throw err; }
        finally { if (generation === this.generation) this.connecting = false; }
    }
    disconnect(reason = 'Disconnected') {
        this.disarm(reason); this.generation++; this.connecting = false;
        const p = this.port; this.port = null; this.gate = null; this.pendingWrite = null;
        if (p && !p.destroyed) p.destroy(); // No re-open, retry, or command replay.
        this.machine.detach();
    }
    disarm(reason = 'Disarmed') {
        this.armed = false; this.gate?.revoke(); this.machine?.stop(); this.reason = reason;
    }
    setMode(mode){
        if(!['step','adaptive'].includes(mode))throw Error('Unknown knob mode');
        this.disarm('Mode changed; arm again explicitly');
        this.mode=this.machine.mode=mode;this.lastState=-Infinity;
        if(this.gate){this.gate.wheel=null;this.gate.velocityAt=-Infinity;}
        this.schedule();
    }
    ui(body) {
        if (!/^[a-f0-9]{32}$/.test(body.session || '')) throw Error('Invalid UI session');
        if (this.armed && (body.session !== this.uiSession || JSON.stringify(precision(body.preset)) !== JSON.stringify(this.preset))) {
            this.disarm('UI session/Precision settings changed'); return;
        }
        if (body.visible !== true) { this.disarm('gSender screen not active'); return; }
        this.uiPreset = precision(body.preset);
        this.uiAt = this.now(); this.uiSession = body.session;
    }
    arm(body) {
        // Never store an arm request awaiting a future connection/ready state.
        this.disarm('Arming checks'); this.machine.sync();
        this.ui(body); this.preset = precision(body.preset);
        this.machine.preset=this.preset;
        if(this.mode==='adaptive'){
            if(!this.gate?.velocityReady())throw Error('Adaptive mode needs the velocity-capable ESP firmware and fresh handshake');
            for(let i=0;i<3;i++)this.machine.limits(i);
        }
        if (body.visible !== true || !this.port?.isOpen || !this.gate?.healthy() || !this.machine.canArm())
            throw Error('Needs ready knob, fresh XYZ/$13, idle CNC, empty feeder, and visible gSender');
        this.armed = true; this.machine.owned = true; this.reason = 'Precision jogging armed'; this.schedule();
    }
    send(line) {
        if (this.pendingWrite || !this.port?.isOpen) return;
        const p = this.port, write = { at: this.now() }; this.pendingWrite = write;
        p.write(Buffer.from(line), err => {
            if (this.port !== p || this.pendingWrite !== write) return;
            this.pendingWrite = null;
            if (err) this.disconnect('USB write failed; no retry');
        });
    }
    tick() {
        if (!this.port?.isOpen || this.ticking) return;
        this.ticking = true;
        try {
            this.machine.sync();
            const now = this.now();
            if (this.pendingWrite && now - this.pendingWrite.at >= 250) return this.disconnect('USB write stalled');
            if (!this.gate) { if (now - this.openAt > 6000) this.disconnect('No live P2 HELLO from ESP'); return; }
            if (now - this.gateAt > 2000 && !this.gate.healthy()) return this.disconnect('ESP heartbeat/ready lost');
            if (this.armed && (now - this.uiAt >= 1500 || !this.gate.healthy() || this.mode==='adaptive'&&!this.gate.velocityReady())) this.disarm('UI/USB lease expired');
            this.machine.tick();
            if (now - this.lastPoll >= 50 && this.machine.current?.isOpen()) {
                this.lastPoll = now; this.machine.call('statusreport'); // Read-only, existing CNC connection.
            }
            const s = this.machine.snapshot();
            const label = this.mode==='adaptive'?(this.armed?'VEL_ARMED':'VEL_READY'):(this.armed ? 'ARMED_' + s.state : 'DISARMED');
            const key = JSON.stringify([s.valid,s.xyz.map(n=>Number.isFinite(n)?Math.round(n*1000):null),
                label,this.armed,this.gate.stepUm]);
            if (!this.pendingWrite && (now - this.lastState >= (this.mode==='adaptive'?40:100) || key!==this.lastStateKey && now-this.lastState>=40)) {
                this.lastState = now;
                this.lastStateKey = key;
                this.send(this.gate.state(s.xyz, s.valid, label, this.armed));
            }
        } catch (err) { this.disarm(err.message); }
        finally { this.ticking = false; }
    }
}
let service;
function start(options) {
    if (service) throw Error('USB pendant already started');
    service = new Pendant(options);
    service.timer = setInterval(() => service.tick(), 10);
    service.timer.unref?.();
    return service;
}
function installRoutes(app) {
    const express = require('express');
    // Called AFTER the app's existing authenticated-localhost middleware.
    app.get('/usb-pendant/:file', (req, res, next) => {
        if (!['launcher.js', 'panel.html', 'panel.js','adaptive-mode.js'].includes(req.params.file)) return next();
        res.set('Cache-Control', 'no-store');
        res.sendFile(path.join(process.env.GSENDER_BUNDLE_DIR, 'usb-pendant', req.params.file));
    });
    app.get('/api/usb-pendant', (req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json(service?.status() || { ready: false, reason: 'Backend starting' });
    });
    app.post('/api/usb-pendant/:action', express.json({ limit: '2kb' }), async (req, res) => {
        // Custom header requires same-origin JS; form/CSRF writes are rejected.
        if (!service || req.get('X-USB-Pendant') !== '1') return res.status(403).end();
        try {
            switch (req.params.action) {
                case 'connect': await service.connect(); break;
                case 'disconnect': service.disconnect(); break;
                case 'arm': service.arm(req.body); break;
                case 'disarm': service.disarm(); break;
                case 'mode': service.setMode(req.body.mode); break;
                case 'heartbeat': service.ui(req.body); break;
                default: return res.status(404).end();
            }
            res.json(service.status());
        } catch (err) { service.disarm(err.message); res.status(409).json({ error: err.message }); }
    });
}
module.exports = { Pendant, start, installRoutes, isEsp };
