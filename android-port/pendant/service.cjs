'use strict';
const path = require('node:path');
const { TabletPad } = require('./tablet-pad.cjs');
const { Lines, Gate, hello, precision, clock } = require('./protocol.cjs');
const { Controller } = require('./controller.cjs');
const { BlePort, pairing:blePairing } = require('./ble-transport.cjs');
const { WifiPort, pairing, host } = require('./wifi-transport.cjs');
const { decodeQr, ScanLease } = require('./qr-pairing.cjs');
const isEsp = p => String(p.vendorId).toLowerCase() === '303a' && String(p.productId).toLowerCase() === '1001';
class Pendant {
    #pairing = null;
    constructor({ SerialPort, getControllers, now = clock, wifiNetwork = process.gsenderWifi, WifiTransport = WifiPort, bleNetwork = process.gsenderBle, BleTransport = BlePort }) {
        this.reconnectWanted = false; this.retryAt = Infinity; this.retryAttempts = 0; this.resumeArm = null;
        this.lastConnectionIssue = null;
        this.bleNetwork = bleNetwork; this.BleTransport = BleTransport;
        this.probing = false; this.probe = null; this.transport = 'usb'; this.wifiNetwork = wifiNetwork; this.WifiTransport = WifiTransport;
        this.SerialPort = SerialPort; this.now = now; this.gate = null; this.port = null;
        this.reason = 'Connect the ESP USB knob'; this.armed = false; this.connecting = false;
        this.generation = 0; this.pendingWrite = null; this.lastState = -Infinity; this.lastPoll = -Infinity;
        this.uiAt = -Infinity; this.uiSession = null; this.preset = null; this.openAt = 0;
        this.machine = new Controller(getControllers, reason => this.disarm(reason), now);
        this.tabletPad = new TabletPad(this.machine, now);
        this.machine.externalJog = this.tabletPad;
        this.mode='step';this.automatic=false;this.modeChosen=false;this.autoContext=null;
        this.scan = new ScanLease(now);
        this.scheduled = false; this.ticking = false; this.lastStateKey = null;
        this.machine.wake = () => this.schedule();
        const foreground = visible => {
            if (visible) return;
            this.scan.cancel(); this.uiAt = -Infinity;
            if (this.isWireless() && this.port)
                this.disconnect('gSender screen not active', { retry:true, retainArm:false });
            else this.disarm('gSender screen not active; arm again');
        };
        this.wifiNetwork?.setForegroundListener?.(foreground); this.bleNetwork?.setForegroundListener?.(foreground);
    }
    isWireless(){return this.transport === 'wifi' || this.transport === 'ble';}
    currentNetwork(){return this.transport === 'ble' ? this.bleNetwork : this.wifiNetwork;}
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
        return { automatic:this.automatic, inputSupported:!!this.gate?.inputContext, lastConnectionIssue:this.lastConnectionIssue, neutralSupported:!!this.gate?.neutralTicket, controlsReleased:!!this.gate?.neutralClear(), reconnecting: this.reconnectWanted && !this.port?.isOpen, armRequested: this.armed || !!this.resumeArm, retryInMs: Number.isFinite(this.retryAt) ? Math.max(0,this.retryAt-this.now()) : null, scanActive: this.scan.active(), wifiProbe: this.probeSummary(), probing: this.probing, transport: this.transport, pairingConfigured: !!this.#pairing && (this.#pairing.transport || 'wifi') === this.transport, pairedDevice: this.#pairing?.device || null, wifiHost: this.#pairing?.host || null, connected: !!this.port?.isOpen, connecting: this.connecting, ready: !!this.gate?.healthy(),
            mode:this.mode,velocityReady:!!this.gate?.velocityReady(),adaptivePhase:this.machine.adaptive.phase,
            page:this.gate?.pageEpoch?['DRO','XY JOG',this.transport === 'ble' ? 'BLUETOOTH' : 'WI-FI'][this.gate.page]:null,
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
        if (!['usb', 'ble', 'wifi'].includes(transport)) throw Error('Choose USB or Bluetooth');
        if (this.port || this.connecting) throw Error('Disconnect the knob before changing connection type');
        this.reconnectWanted = false; this.retryAt = Infinity;
        this.lastConnectionIssue = null;
        this.disarm('Connection type changed'); this.transport = transport;
    }
    configurePairing(text, override) {
        this.scan.cancel();
        if (this.port || this.connecting) throw Error('Disconnect the knob before changing pairing');
        if (!text && this.#pairing && override && this.#pairing.transport !== 'ble') {
            const address = host(override); this.reconnectWanted = false; this.retryAt = Infinity;
            this.disarm('Pairing address changed'); this.#pairing.host = address; return;
        }
        const next = this.transport === 'ble' ? blePairing(text) : pairing(text, override);
        this.reconnectWanted = false; this.retryAt = Infinity; this.disarm('Pairing changed');
        this.lastConnectionIssue = null;
        this.#pairing?.psk.fill(0); this.#pairing = next;
    }
    forgetPairing() {
        this.scan.cancel();
        if (this.port || this.connecting) throw Error('Disconnect the knob before forgetting pairing');
        this.reconnectWanted = false; this.retryAt = Infinity; this.disarm('Pairing forgotten');
        this.#pairing?.psk.fill(0); this.#pairing = null;
    }
    async connect({ probe = false, retry = false, automatic = false } = {}) {
        if(automatic)this.enableAutomatic();
        if (this.scan.active()) throw Error('Close the pairing scanner before connecting');
        if (this.port || this.connecting) throw Error('Disconnect the existing knob first');
        const wireless = this.isWireless();
        if (probe && !wireless) throw Error('Select a wireless knob to test its link');
        if (!retry) { this.retryAttempts = 0; this.resumeArm = null; this.machine.recovering = false; }
        this.reconnectWanted = wireless && !probe; this.retryAt = Infinity;
        this.probing = probe;
        if (probe) this.probe = { samples: [], late: 0, replayed: 0, result: 'Connecting' };
        this.connecting = true; this.reason = wireless ? (this.transport === 'ble' ? 'Finding and authenticating paired Bluetooth knob' : 'Connecting paired knob on current Wi-Fi') : 'Checking ESP native USB';
        const generation = ++this.generation;
        try {
            let p, matches;
            if (wireless) {
                if (!this.#pairing || (this.#pairing.transport || 'wifi') !== this.transport) throw Error('Scan the matching knob QR first');
                p = this.transport === 'ble'
                    ? new this.BleTransport(this.#pairing, {network:this.bleNetwork,now:this.now})
                    : new this.WifiTransport(this.#pairing, { network: this.wifiNetwork, now: this.now });
            } else {
                const all = await this.SerialPort.list(); matches = all.filter(isEsp);
                if (generation !== this.generation) return;
                if (matches.length !== 1) throw Error(`Expected one ESP native USB 303A:1001; found ${matches.length}`);
                p = new this.SerialPort({ path: matches[0].path, baudRate: 115200, autoOpen: false, dtr: false, rts: false, writeDeadlineMs: 250 });
            }
            this.port = p; this.lines = new Lines(); this.gate = null;
            p.on('error', err => { if (this.port === p) this.disconnect((wireless ? 'Wireless error: ' : 'USB error: ') + err.message, { retry: wireless && !err.hard, retainArm: !['WIFI_FOREGROUND','BLE_FOREGROUND'].includes(err.code) }); });
            p.on('close', () => { if (this.port === p) this.disconnect('Knob link lost', { retry: wireless }); });
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
                            const oldTicket = this.gate.aliveTicket, firstPage = !this.gate.pageEpoch;
                            const event = this.gate.receive(line);
                            if(event?.type==='input' && event.contextChanged)this.lastState=-Infinity;
                            if(event?.type==='input' && event.mixed)this.disarm('Direction changed; release controls briefly');
                            if(event?.type==='input' && event.contextChanged &&
                                !(this.armed && event.expectedEnableTransition) &&
                                !(this.tabletPad.busy() && !this.armed && event.expectedDisableTransition))
                                this.disarm('Knob controls changed; release briefly');
                            if(event?.type==='page'){
                                this.pageChangeAt=this.now();
                                const resumedPage = firstPage && this.resumeArm && event.page === this.resumeArm.page && event.epoch === this.resumeArm.pageEpoch;
                                if (!resumedPage) this.disarm('Knob page changed; arm again on a control page');
                            }
                            if (this.probing && line.startsWith('P2 ALIVE ')) {
                                const ticket = Number(line.split(' ')[4]), issued = this.gate.tickets.get(ticket);
                                if (this.gate.aliveTicket !== oldTicket && issued) {
                                    if (this.probe.samples.length < 512) this.probe.samples.push(this.now() - issued.at);
                                } else if (issued && this.now() - issued.at >= 100) this.probe.late++;
                                else this.probe.replayed++;
                            }
                            if (!this.probing && (step !== this.gate.stepUm || selection !== this.gate.selection)) this.machine.clearQueue();
                            if (event && this.armed && !this.probing) {
                                if(event.type==='pad')this.machine.pad(event,this.preset);
                                else if(this.mode==='adaptive'){
                                    if(event.isNew===undefined)throw Error('Untimed legacy detent in adaptive mode');
                                    this.machine.wheel(event,this.preset);
                                }
                                else if(event.type==='input' && event.isNew && event.direction){
                                    // Exact mode retains the bounded eight-turn queue. Never
                                    // turn a burst into one larger, uninterruptible jog.
                                    for(let i=0;i<Math.min(event.count,8);i++)this.machine.submit(event,this.preset);
                                    this.machine.dropped+=Math.max(0,event.count-8);
                                }
                                else if(event.isNew===undefined && event.direction)this.machine.submit(event, this.preset);
                            }
                        }
                    }
                    this.schedule();
                } catch (err) { this.disconnect(err.message, { retry: wireless && (err.code === 'WIFI_LEASE_EXPIRED' || this.automatic && err.code === 'PENDANT_REBOOT'), retainArm:false }); }
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
        } catch (err) { if (generation === this.generation) this.disconnect(err.message, { retry: wireless }); throw err; }
        finally { if (generation === this.generation) this.connecting = false; }
    }
    armContext() {
        const c = this.machine.current;
        return { boot:this.gate.boot, page:this.gate.page, pageEpoch:this.gate.pageEpoch,
            stepUm:this.gate.stepUm, selection:this.gate.selection, mode:this.mode,
            session:this.uiSession, preset:this.preset, controller:c,
            transport:c?.connection?.connection?.port, settings:this.machineSettings() };
    }
    machineSettings() {
        const settings = this.machine.current?.settings?.settings || {};
        return JSON.stringify(Object.keys(settings).sort().map(key => [key, settings[key]]));
    }
    disconnect(reason = 'Disconnected', { retry = false, retainArm = true } = {}) {
        this.scan.cancel();
        const recover = retry && this.reconnectWanted && this.isWireless() && !this.probing;
        const intent = !this.automatic && recover && retainArm ? this.resumeArm || (this.armed && this.gate ? this.armContext() : null) : null;
        if (this.probing && this.probe) this.probe.result = reason;
        this.probing = false;
        this.disarm(reason); this.generation++; this.connecting = false;
        const p = this.port; this.port = null; this.gate = null; this.pendingWrite = null;
        // Remove ownership before destroying: synchronous callbacks cannot retry twice.
        if (p && !p.destroyed) p.destroy();
        if (recover) {
            this.lastConnectionIssue = reason;
            this.resumeArm = intent; this.machine.recovering = !!intent;
            this.retryAt = this.now() + Math.min(5000, 500 * 2 ** Math.min(this.retryAttempts++, 4));
            this.reason = reason + (intent ? '; reconnecting with jog paused' : '; reconnecting');
            // Keep the CNC observer so cancellation ACKs and intervening controls
            // cannot disappear while only the knob transport is reconnecting.
        } else {
            this.reconnectWanted = false; this.retryAt = Infinity; this.retryAttempts = 0;
            this.machine.detach();
        }
    }
    disarm(reason = 'Disarmed') {
        this.resumeArm = null; if (this.machine) this.machine.recovering = false;
        this.armed = false; this.gate?.revoke(); this.machine?.stop(reason); this.reason = reason;
        if(this.automatic && this.gate){this.gate.neutralSince=null;this.gate.neutralAt=-Infinity;}
    }
    recoverArm() {
        const r = this.resumeArm, g = this.gate;
        if (!r) return;
        const state = this.machine.snapshot();
        if (!state.idle || !state.empty || state.rotary || state.valid && !['IDLE','JOG'].includes(state.state)) {
            this.disarm('CNC state changed during reconnection; arm again'); return;
        }
        if (this.now()-this.uiAt >= 1500 || r.session !== this.uiSession || r.mode !== this.mode ||
            JSON.stringify(r.preset) !== JSON.stringify(this.uiPreset) || r.controller !== this.machine.current ||
            r.transport !== this.machine.current?.connection?.connection?.port || r.settings !== this.machineSettings() ||
            this.machine.cancelFailed || g && (r.boot !== g.boot || g.pageEpoch &&
                (r.page !== g.page || r.pageEpoch !== g.pageEpoch || r.stepUm !== g.stepUm || r.selection !== g.selection))) {
            this.disarm('Controls changed during reconnection; arm again'); return;
        }
        if (!g?.healthy() || !g.neutralReady() || !g.pageEpoch || g.page === 2 ||
            this.now()-g.pageAt >= g.leaseMs || !this.machine.canArm()) return;
        if (this.mode === 'adaptive') {
            if (!g.velocityReady() || !Number.isFinite(r.preset.rapidFeedrate)) return;
            this.machine.preset = r.preset;
            for (let i=0;i<3;i++) this.machine.limits(i);
        }
        this.resumeArm = null; this.machine.recovering = false;
        this.preset = r.preset; this.armed = true; this.machine.owned = true;
        this.lastState = -Infinity;
        this.reason = 'Reconnected; jogging armed for new input';
    }
    reconnectTick() {
        if (!this.reconnectWanted || this.probing) return;
        if (this.now()-this.uiAt >= 1500 || this.currentNetwork()?.foreground === false) {
            if (this.resumeArm) this.disarm('gSender screen not active; arm again');
            return;
        }
        this.machine.sync(); if(!this.automatic)this.recoverArm();
        if (!this.port && !this.connecting && this.now() >= this.retryAt && !this.scan.active())
            this.connect({ retry:true }).catch(() => {}); // Bounded backoff; no motion is replayed.
    }
    setMode(mode){
        this.scan.cancel();
        if(!['step','adaptive'].includes(mode))throw Error('Unknown knob mode');
        this.modeChosen=true;this.disarm('Mode changed; release controls briefly');
        this.mode=this.machine.mode=mode;this.lastState=-Infinity;
        if(this.gate){this.gate.wheel=null;this.gate.velocityAt=-Infinity;}
        this.schedule();
    }
    ui(body) {
        if (body.visible !== true || this.uiSession && body.session !== this.uiSession) this.scan.cancel();
        if (!/^[a-f0-9]{32}$/.test(body.session || '')) throw Error('Invalid UI session');
        if(body.automatic===true)this.enableAutomatic();
        if (body.visible !== true) {
            this.uiAt = -Infinity; this.uiPreset = null;
            this.disarm('gSender screen not active'); return;
        }
        let nextPreset = null;
        try { nextPreset = precision(body.preset); } catch { /* Presence does not grant motion. */ }
        if ((this.armed || this.resumeArm) && (body.session !== this.uiSession ||
            !nextPreset || JSON.stringify(nextPreset) !== JSON.stringify(this.preset)))
            this.disarm('UI session/Precision settings changed; arm again');
        this.uiPreset = nextPreset;
        this.uiAt = this.now(); this.uiSession = body.session;
    }
    enableAutomatic() {
        if(this.automatic)return;
        this.automatic=true;this.machine.watchControls=true;this.disarm('Waiting for fresh knob controls');
        if(!this.modeChosen)this.mode=this.machine.mode='adaptive';
        this.lastState=-Infinity;
    }
    automaticTick() {
        const g=this.gate, m=this.machine, now=this.now();
        const context={controller:m.current,transport:m.current?.connection?.connection?.port,
            key:JSON.stringify([this.uiSession,this.uiPreset,this.mode,this.machineSettings(),g?.selection,g?.stepUm,g?.page,g?.pageEpoch])};
        if(!this.autoContext || this.autoContext.controller!==context.controller || this.autoContext.transport!==context.transport || this.autoContext.key!==context.key){
            this.disarm('Controls changed; release briefly');this.autoContext=context;
        }
        let reason=null;
        if(now-this.uiAt>=1500 || this.currentNetwork()?.foreground===false)reason='gSender screen not active';
        else if(this.scan.active() || this.probing)reason='Pairing in progress';
        else if(!g?.inputContext)reason='Update knob firmware for automatic readiness';
        else if(!g.healthy() || !g.velocityReady())reason='Waiting for fresh knob input';
        else if(!this.uiPreset)reason='Save valid Precision and Rapid jog presets in mm';
        else if(!g.pageEpoch || g.page===2 || g.selection===3 || !g.stepUm)reason='Select a control page, axis and nonzero STEP';
        else if(this.tabletPad.busy())reason='Tablet XY pad in use';
        if(reason){
            if(this.armed)this.disarm(reason);
            // No accumulated release time while any prerequisite is missing.
            if(g)g.neutralSince=null;
            this.reason=reason;return;
        }
        if(this.armed)return; // Controller.tick validates owned IDLE/JOG motion.
        m.preset=this.uiPreset;
        try {
            for(let i=0;i<3;i++)m.limits(i);
            if(this.mode==='adaptive'&&!Number.isFinite(this.uiPreset.rapidFeedrate))throw Error('Save a Rapid jog feed');
        } catch(e){g.neutralSince=null;this.reason=e.message;return;}
        if(!m.canArm()){
            const s=m.snapshot();
            // Our own asynchronous status query briefly occupies USB. It must
            // block enabling, but must not restart the 300 ms release timer.
            if(!s.valid || s.state!=='IDLE' || !s.idle || !s.empty || s.rotary ||
                m.cancelPending || m.cancelFailed || m.touch.busy())g.neutralSince=null;
            this.reason='Waiting for idle CNC and completed commands';return;
        }
        if(!g.neutralReady()){this.reason='Release knob controls briefly';return;}
        this.preset=this.uiPreset;this.armed=true;m.owned=true;this.lastState=-Infinity;
        this.reason='Ready for new knob input';
    }
    arm(body) {
        if(this.automatic)throw Error('Knob readiness is automatic; release controls and wait for idle CNC');
        if (this.scan.active()) throw Error('Close the pairing scanner before arming');
        if (this.probing) throw Error('Link test cannot arm; connect normally after the test');
        // Initial arming is explicit and checked immediately. Only a previously
        // successful arm may be retained through a transient Wi-Fi outage.
        this.disarm('Arming checks'); this.machine.sync();
        this.ui(body); this.preset = precision(body.preset);
        if(this.gate?.page===2)throw Error('Wireless page cannot jog; click knob to a control page first');
        if (this.isWireless() && this.gate?.neutralTicket && !this.gate.neutralClear())
            throw Error('Release the knob controls briefly before arming');
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
    tabletStatus() {
        this.machine.sync();
        // Snapshot before querying: statusreport writes to the asynchronous USB
        // stream, so checking afterward would see our own request as busy.
        const cnc = this.machine.snapshot(), ready = this.machine.canArm();
        let reason = null;
        if (!ready) {
            if (!this.machine.current?.isOpen()) reason = 'Connect a CNC controller';
            else if (!cnc.valid) reason = 'Waiting for fresh CNC position and units';
            else if (cnc.rotary) reason = 'XY pad unavailable in rotary mode';
            else if (!cnc.idle) reason = 'Stop the current job before jogging';
            else if (cnc.state !== 'IDLE') reason = 'CNC is ' + cnc.state.toLowerCase();
            else if (this.machine.cancelFailed) reason = 'Jog cancellation failed; reconnect the CNC';
            else if (this.machine.cancelPending) reason = 'Waiting for jog cancellation';
            else if (!cnc.empty || !cnc.transportEmpty) reason = 'Waiting for queued commands to finish';
            else reason = 'Waiting for the current jog to stop';
        }
        if (this.machine.current?.isOpen()) this.machine.call('statusreport');
        return {ready, reason, active:this.tabletPad.busy(), cnc};
    }
    beginTabletPad(body) {
        if(this.scan.active() || this.tabletPad.busy())throw Error('Close the scanner or release the current touch');
        if(body.visible!==true || this.currentNetwork()?.foreground===false)throw Error('gSender screen not active');
        this.disarm('Tablet XY pad selected; knob disarmed');
        this.machine.sync();
        return this.tabletPad.begin(body.rapid);
    }
    beginScan() {
        if (this.port || this.connecting || this.armed || this.probing)
            throw Error('Disconnect the knob before scanning');
        if (!this.isWireless()) this.transport = 'ble';
        this.reconnectWanted = false; this.retryAt = Infinity; this.disarm('Scanning knob QR');
        return this.scan.begin(this.generation);
    }
    checkScan(token) {
        this.scan.check(token, this.generation);
        if (!this.isWireless() || this.port || this.connecting || this.armed || this.probing)
            throw Error('Disconnect the knob before pairing');
    }
    commitScan(token, qr) {
        this.checkScan(token);
        const next = decodeQr(qr);
        if ((next.transport || 'wifi') !== this.transport) throw Error('Scan the QR for the selected connection type');
        this.scan.cancel();
        this.configurePairing(JSON.stringify(next));
        this.reconnectWanted = true; this.retryAttempts = 0; this.retryAt = this.now();
        this.reason = 'Pairing saved; connecting automatically';
        this.schedule();
    }
    send(line) {
        if (this.pendingWrite || !this.port?.isOpen) return;
        const p = this.port, write = { at: this.now() }; this.pendingWrite = write;
        p.write(Buffer.from(line), err => {
            if (this.port !== p || this.pendingWrite !== write) return;
            this.pendingWrite = null;
            if (err) this.disconnect('Knob write failed', { retry:this.isWireless() });
        });
    }
    tick() {
        if (this.ticking) return;
        this.ticking = true;
        try {
            this.reconnectTick();
            if(this.tabletPad.busy()) {
                this.machine.sync();
                if(this.machine.owned)this.machine.tick();
                if(this.now()-this.lastPoll>=50 && this.machine.current?.isOpen()) {
                    this.lastPoll=this.now();this.machine.call('statusreport');
                }
            }
            if (!this.port?.isOpen) {
                if (this.resumeArm && this.now()-this.lastPoll >= 50 && this.machine.current?.isOpen()) {
                    this.lastPoll = this.now(); this.machine.call('statusreport');
                }
                return;
            }
            if (!this.probing) this.machine.sync();
            const now = this.now(), wireless = this.isWireless();
            if (this.pendingWrite && now - this.pendingWrite.at >= (wireless ? 100 : 250)) return this.disconnect('Knob write stalled', { retry:wireless });
            if (!this.gate) { if (now - this.openAt > (wireless ? 30000 : 6000)) this.disconnect('No live P2 HELLO from ESP', { retry:wireless }); return; }
            if (wireless ? now - this.gateAt >= 250 && !this.gate.live() : now - this.gateAt > 2000 && !this.gate.live())
                return this.disconnect('ESP heartbeat lost', { retry:wireless });
            // A drawing/not-ready knob with fresh authenticated heartbeats is
            // still connected. Readiness gates motion, never transport lifetime.
            if (this.gate.healthy()) this.retryAttempts = 0;
            if (this.probing) {
                if (now - this.openAt >= 10000) return this.disconnect('Link test complete; connect and arm manually');
                if (!this.pendingWrite && now - this.lastState >= 40) {
                    this.lastState = now; this.send(this.gate.state([0,0,0], false, 'LINK_TEST', false));
                }
                return;
            }
            if (this.armed && (now - this.uiAt >= 1500 || !this.gate.healthy() || this.mode==='adaptive'&&!this.gate.velocityReady())) this.disarm('UI/USB lease expired');
            if(this.automatic)this.automaticTick();
            this.machine.tick();
            if (now - this.lastPoll >= 50 && this.machine.current?.isOpen()) {
                this.lastPoll = now; this.machine.call('statusreport'); // Read-only, existing CNC connection.
            }
            const s = this.machine.snapshot();
            const label = (this.automatic?'B':'') + (this.mode==='adaptive'?'VPAD_':'PAD_') + (wireless||this.automatic?'R_':'') + (this.armed?'ARMED':'READY');
            const key = JSON.stringify([s.valid,s.xyz.map(n=>Number.isFinite(n)?Math.round(n*1000):null),
                label,this.armed,this.gate.stepUm]);
            if (!this.pendingWrite && (now - this.lastState >= (wireless || this.mode==='adaptive' || this.gate.pageEpoch?40:100) || key!==this.lastStateKey && now-this.lastState>=40)) {
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
    app.get('/api/tablet-pad', (req,res) => {
        res.set('Cache-Control','no-store');
        try { res.json(service?.tabletStatus() || {ready:false}); }
        catch { res.status(409).json({error:'CNC status unavailable'}); }
    });
    app.post('/api/tablet-pad/:action', express.json({limit:'2kb'}), (req,res) => {
        if(!service || req.get('X-USB-Pendant')!=='1')return res.status(403).end();
        res.set('Cache-Control','no-store');
        try {
            if(req.params.action==='begin')return res.json(service.beginTabletPad(req.body));
            if(req.params.action==='move')return res.json(service.tabletPad.update(req.body));
            if(req.params.action==='end'){service.tabletPad.end(req.body?.token);return res.json({ok:true});}
            res.status(404).end();
        } catch(error) { res.status(409).json({error:error.message}); }
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
                case 'connect': await service.connect({automatic:req.body?.automatic===true}); break;
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
