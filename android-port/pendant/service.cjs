'use strict';
const path = require('node:path');
const { Lines, Gate, hello, precision, clock } = require('./protocol.cjs');
const { Controller } = require('./controller.cjs');
const { WifiPort, pairing, host } = require('./wifi-transport.cjs');
const { decodeQr, ScanLease } = require('./qr-pairing.cjs');
const isEsp = p => String(p.vendorId).toLowerCase() === '303a' && String(p.productId).toLowerCase() === '1001';
class Pendant {
    #pairing = null;
    constructor({ SerialPort, getControllers, now = clock, wifiNetwork = process.gsenderWifi, WifiTransport = WifiPort }) {
        this.probing = false; this.probe = null; this.transport = 'usb'; this.wifiNetwork = wifiNetwork; this.WifiTransport = WifiTransport;
        this.SerialPort = SerialPort; this.now = now; this.gate = null; this.port = null;
        this.reason = 'Connect the ESP USB knob'; this.armed = false; this.connecting = false;
        this.generation = 0; this.pendingWrite = null; this.lastState = -Infinity; this.lastPoll = -Infinity;
        this.uiAt = -Infinity; this.uiSession = null; this.preset = null; this.openAt = 0;
        this.machine = new Controller(getControllers, reason => this.disarm(reason), now);
        this.mode='step';
        this.scan = new ScanLease(now);
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
        return { scanActive: this.scan.active(), wifiProbe: this.probeSummary(), probing: this.probing, transport: this.transport, pairingConfigured: !!this.#pairing, pairedDevice: this.#pairing?.device || null, wifiHost: this.#pairing?.host || null, connected: !!this.port?.isOpen, connecting: this.connecting, ready: !!this.gate?.healthy(),
            mode:this.mode,velocityReady:!!this.gate?.velocityReady(),adaptivePhase:this.machine.adaptive.phase,
            armed: this.armed, reason: this.reason, port: this.port?.path || null, preset: this.armed ? this.preset : this.uiPreset,
            stepMm: this.gate ? this.gate.stepUm / 1000 : null,
            selection: this.gate ? ['X','Y','Z','STEP'][this.gate.selection] : null,
            droppedTurns: this.machine.dropped + (this.gate?.dropped || 0), cnc: this.machine.snapshot() };
    }
    probeSummary() {
        if (!this.probe) return null;
        const sorted = [...this.probe.samples].sort((a,b) => a-b), n = sorted.length;
        return { running: this.probing, samples: n, late: this.probe.late, replayed: this.probe.replayed,
            medianMs: n ? sorted[Math.floor(n/2)] : null, p95Ms: n ? sorted[Math.ceil(n*.95)-1] : null,
            maxMs: n ? sorted[n-1] : null, result: this.probe.result };
    }
    setTransport(transport) {
        this.scan.cancel();
        if (!['usb', 'wifi'].includes(transport)) throw Error('Choose USB or Wi-Fi');
        if (this.port || this.connecting) throw Error('Disconnect the knob before changing connection type');
        this.disarm('Connection type changed; connect and arm manually'); this.transport = transport;
    }
    configurePairing(text, override) {
        this.scan.cancel();
        if (this.port || this.connecting) throw Error('Disconnect the knob before changing pairing');
        if (!text && this.#pairing && override) { this.#pairing.host = host(override); return; }
        const next = pairing(text, override);
        this.#pairing?.psk.fill(0); this.#pairing = next;
    }
    forgetPairing() {
        this.scan.cancel();
        if (this.port || this.connecting) throw Error('Disconnect the knob before forgetting pairing');
        this.#pairing?.psk.fill(0); this.#pairing = null;
    }
    async connect({ probe = false } = {}) {
        if (this.scan.active()) throw Error('Close the pairing scanner before connecting');
        if (this.port || this.connecting) throw Error('Disconnect the existing knob first');
        const wireless = this.transport === 'wifi';
        if (probe && !wireless) throw Error('Select Wi-Fi to test the wireless link');
        this.probing = probe;
        if (probe) this.probe = { samples: [], late: 0, replayed: 0, result: 'Connecting' };
        this.connecting = true; this.reason = wireless ? 'Connecting paired knob on current Wi-Fi' : 'Checking ESP native USB';
        const generation = ++this.generation;
        try {
            let p, matches;
            if (wireless) {
                if (!this.#pairing) throw Error('Paste the USB-provisioned pairing JSON first');
                p = new this.WifiTransport(this.#pairing, { network: this.wifiNetwork, now: this.now });
            } else {
                const all = await this.SerialPort.list(); matches = all.filter(isEsp);
                if (generation !== this.generation) return;
                if (matches.length !== 1) throw Error(`Expected one ESP native USB 303A:1001; found ${matches.length}`);
                p = new this.SerialPort({ path: matches[0].path, baudRate: 115200, autoOpen: false, dtr: false, rts: false, writeDeadlineMs: 250 });
            }
            this.port = p; this.lines = new Lines(); this.gate = null;
            p.on('error', err => { if (this.port === p) this.disconnect((wireless ? 'Wi-Fi error: ' : 'USB error: ') + err.message); });
            p.on('close', () => { if (this.port === p) this.disconnect('Knob disconnected; reconnect and re-arm manually'); });
            p.on('data', bytes => {
                if (this.port !== p) return;
                try {
                    for (const line of this.lines.feed(bytes)) {
                        if (!this.gate) {
                            if (line.startsWith('B1 ') || line.startsWith('P1 ')) throw Error('Old/BENCH firmware installed; flash the P2 STEP build first');
                            if (!line.startsWith('P2 HELLO ')) { if (wireless) throw Error('Expected authenticated P2 HELLO'); continue; } // Bounded startup window; ROM boot text only.
                            this.gate = new Gate(hello(line), this.now, wireless);
                            this.gateAt = this.now(); this.reason = 'Display only; waiting for handshake';
                        } else {
                            const step = this.gate.stepUm, selection = this.gate.selection;
                            const oldTicket = this.gate.aliveTicket;
                            const event = this.gate.receive(line);
                            if (this.probing && line.startsWith('P2 ALIVE ')) {
                                const ticket = Number(line.split(' ')[4]), issued = this.gate.tickets.get(ticket);
                                if (this.gate.aliveTicket !== oldTicket && issued) {
                                    if (this.probe.samples.length < 512) this.probe.samples.push(this.now() - issued.at);
                                } else if (issued && this.now() - issued.at >= 100) this.probe.late++;
                                else this.probe.replayed++;
                            }
                            if (!this.probing && (step !== this.gate.stepUm || selection !== this.gate.selection)) this.machine.clearQueue();
                            if (event && this.armed && !this.probing) {
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
            if (!wireless) {
                const after = (await this.SerialPort.list()).find(d => d.path === p.path);
                if (!after || !isEsp(after) || matches[0].serialNumber && after.serialNumber !== matches[0].serialNumber)
                    throw Error('USB identity changed while opening');
            }
        } catch (err) { if (generation === this.generation) this.disconnect(err.message); throw err; }
        finally { if (generation === this.generation) this.connecting = false; }
    }
    disconnect(reason = 'Disconnected') {
        this.scan.cancel();
        if (this.probing && this.probe) this.probe.result = reason;
        this.probing = false;
        this.disarm(reason); this.generation++; this.connecting = false;
        const p = this.port; this.port = null; this.gate = null; this.pendingWrite = null;
        if (p && !p.destroyed) p.destroy(); // No re-open, retry, or command replay.
        this.machine.detach();
    }
    disarm(reason = 'Disarmed') {
        this.armed = false; this.gate?.revoke(); this.machine?.stop(); this.reason = reason;
    }
    setMode(mode){
        this.scan.cancel();
        if(!['step','adaptive'].includes(mode))throw Error('Unknown knob mode');
        this.disarm('Mode changed; arm again explicitly');
        this.mode=this.machine.mode=mode;this.lastState=-Infinity;
        if(this.gate){this.gate.wheel=null;this.gate.velocityAt=-Infinity;}
        this.schedule();
    }
    ui(body) {
        if (body.visible !== true || this.uiSession && body.session !== this.uiSession) this.scan.cancel();
        if (!/^[a-f0-9]{32}$/.test(body.session || '')) throw Error('Invalid UI session');
        if (this.armed && (body.session !== this.uiSession || JSON.stringify(precision(body.preset)) !== JSON.stringify(this.preset))) {
            this.disarm('UI session/Precision settings changed'); return;
        }
        if (body.visible !== true) { this.disarm('gSender screen not active'); return; }
        this.uiPreset = precision(body.preset);
        this.uiAt = this.now(); this.uiSession = body.session;
    }
    arm(body) {
        if (this.scan.active()) throw Error('Close the pairing scanner before arming');
        if (this.probing) throw Error('Link test cannot arm; connect normally after the test');
        // Never store an arm request awaiting a future connection/ready state.
        this.disarm('Arming checks'); this.machine.sync();
        this.ui(body); this.preset = precision(body.preset);
        this.machine.preset=this.preset;
        if(this.mode==='adaptive'){
            if(!this.gate?.velocityReady())throw Error('Adaptive mode needs the velocity-capable ESP firmware and fresh handshake');
            if(!Number.isFinite(this.preset.rapidFeedrate))throw Error('Save a Rapid jog feed before arming Adaptive mode');
            for(let i=0;i<3;i++)this.machine.limits(i);
        }
        if (body.visible !== true || !this.port?.isOpen || !this.gate?.healthy() || !this.machine.canArm())
            throw Error('Needs ready knob, fresh XYZ/$13, idle CNC, empty feeder, and visible gSender');
        this.armed = true; this.machine.owned = true;
        this.reason = this.mode==='adaptive'?'Adaptive Precision-to-Rapid jogging armed':'Precision jogging armed';
        this.schedule();
    }
    beginScan() {
        if (this.transport !== 'wifi' || this.port || this.connecting || this.armed || this.probing)
            throw Error('Select Wi-Fi and disconnect the knob before scanning');
        return this.scan.begin(this.generation);
    }
    checkScan(token) {
        this.scan.check(token, this.generation);
        if (this.transport !== 'wifi' || this.port || this.connecting || this.armed || this.probing)
            throw Error('Disconnect the knob before pairing');
    }
    commitScan(token, qr) {
        this.checkScan(token);
        const next = decodeQr(qr);
        this.scan.cancel();
        this.configurePairing(JSON.stringify(next));
        this.reason = 'Pairing saved for this app session. Close the QR on the knob, then test the link.';
    }
    send(line) {
        if (this.pendingWrite || !this.port?.isOpen) return;
        const p = this.port, write = { at: this.now() }; this.pendingWrite = write;
        p.write(Buffer.from(line), err => {
            if (this.port !== p || this.pendingWrite !== write) return;
            this.pendingWrite = null;
            if (err) this.disconnect('Knob write failed; no retry');
        });
    }
    tick() {
        if (!this.port?.isOpen || this.ticking) return;
        this.ticking = true;
        try {
            if (!this.probing) this.machine.sync();
            const now = this.now(), wireless = this.transport === 'wifi';
            if (this.pendingWrite && now - this.pendingWrite.at >= (wireless ? 100 : 250)) return this.disconnect('Knob write stalled');
            if (!this.gate) { if (now - this.openAt > 6000) this.disconnect('No live P2 HELLO from ESP'); return; }
            if (wireless ? now - this.gateAt >= 250 && !this.gate.live() : now - this.gateAt > 2000 && !this.gate.healthy())
                return this.disconnect('ESP heartbeat/ready lost');
            if (wireless && !this.gate.ready && now - this.openAt >= 6000) return this.disconnect('Knob readiness timed out');
            if (this.probing) {
                if (now - this.openAt >= 10000) return this.disconnect('Link test complete; connect and arm manually');
                if (!this.pendingWrite && now - this.lastState >= 40) {
                    this.lastState = now; this.send(this.gate.state([0,0,0], false, 'LINK_TEST', false));
                }
                return;
            }
            if (this.armed && (now - this.uiAt >= 1500 || !this.gate.healthy() || this.mode==='adaptive'&&!this.gate.velocityReady())) this.disarm('UI/USB lease expired');
            this.machine.tick();
            if (now - this.lastPoll >= 50 && this.machine.current?.isOpen()) {
                this.lastPoll = now; this.machine.call('statusreport'); // Read-only, existing CNC connection.
            }
            const s = this.machine.snapshot();
            const label = this.mode==='adaptive'?(this.armed?'VEL_ARMED':'VEL_READY'):(this.armed ? 'ARMED_' + s.state : 'DISARMED');
            const key = JSON.stringify([s.valid,s.xyz.map(n=>Number.isFinite(n)?Math.round(n*1000):null),
                label,this.armed,this.gate.stepUm]);
            if (!this.pendingWrite && (now - this.lastState >= (wireless || this.mode==='adaptive'?40:100) || key!==this.lastStateKey && now-this.lastState>=40)) {
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
                case 'scan-begin': return res.json({ token:service.beginScan() });
                case 'scan-check': service.checkScan(req.body?.token); return res.json({ ok:true });
                case 'scan-cancel': service.scan.cancel(req.body?.token || ''); return res.json({ ok:true });
                case 'scan-commit': service.commitScan(req.body?.token, req.body?.qr); return res.json({ ok:true });
                case 'connect': await service.connect(); break;
                case 'probe': await service.connect({ probe: true }); break;
                case 'transport': service.setTransport(req.body?.transport); break;
                case 'pair': service.configurePairing(req.body?.pairing, req.body?.host); break;
                case 'forget': service.forgetPairing(); break;
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
