'use strict';

// The SLB uses STM32 CDC USB. Restrict automatic selection to its first serial
// interface; ESP USB knobs and other serial adapters still require manual use.
const isSlb = port => /^android-usb:\d+:0$/.test(port.path || '') &&
    String(port.vendorId).toLowerCase() === '0483' &&
    String(port.productId).toLowerCase() === '5740';

class SlbAutoConnect {
    constructor({ list, getConnection, getOpener, report = () => {} }) {
        Object.assign(this, { list, getConnection, getOpener, report });
        this.attempted = new Set();
        this.opening = null;
        this.scanning = false;
        this.stopped = false;
    }
    suppress(path) { this.attempted.add(path); }
    open(opener, path, options, callback = () => {}) {
        if (this.stopped || this.opening) {
            callback(new Error(this.stopped ? 'USB autoconnect stopped' : 'A board connection is already in progress'));
            return;
        }
        this.attempted.add(path);
        const attempt = {};
        this.opening = attempt;
        let settled = false;
        const done = error => {
            // Connection retains its callback and may call it again on close.
            // An old close must not release a newer permission/open request.
            if (settled) return;
            settled = true;
            if (this.opening === attempt) this.opening = null;
            callback(error);
        };
        try { opener(path, options, done); } catch (error) { done(error); }
    }
    async scan() {
        if (this.stopped || this.scanning || !this.getOpener()) return;
        this.scanning = true;
        try {
            const ports = await this.list();
            if (this.stopped) return;
            const present = new Set(ports.map(port => port.path));
            for (const path of this.attempted) {
                if (!present.has(path)) this.attempted.delete(path);
            }
            const matches = ports.filter(isSlb);
            const open = this.getOpener();
            // Never replace an active/initializing controller or choose between
            // multiple boards. One attempt per attachment avoids permission loops.
            if (!open || this.opening || this.getConnection() || matches.length !== 1) return;
            const path = matches[0].path;
            if (this.attempted.has(path)) return;
            this.report('SLB auto-connect: requesting ' + path);
            open(path, { baudrate: 115200, network: false, defaultFirmware: 'GrblHAL' }, error => {
                this.report(error ? 'SLB auto-connect failed: ' + error.message : 'SLB connected automatically');
            });
        } catch (error) {
            // A failed enumeration is not a detach; retain suppressed attachments.
            this.report('SLB USB scan failed: ' + error.message);
        } finally { this.scanning = false; }
    }
    stop() { this.stopped = true; }
}

const engines = new WeakMap();
exports.attach = (engine, socket, { SerialPort, open }) => {
    let state = engines.get(engine);
    if (!state) {
        const clients = new Map();
        const connector = new SlbAutoConnect({
            list: () => SerialPort.list(), getConnection: () => engine.connection,
            getOpener: () => clients.values().next().value,
            report: message => require('./local-access.cjs').report(message),
        });
        const timer = setInterval(() => connector.scan(), 1000);
        timer.unref();
        state = { clients, connector, timer };
        engines.set(engine, state);
    }
    const wrapped = (...args) => state.connector.open(open, ...args);
    state.clients.set(socket, wrapped);
    socket.on('close', path => state.connector.suppress(path));
    socket.once('disconnect', () => state.clients.delete(socket));
    // Only authenticated UI sockets reach this point. Also handles a board
    // already plugged in when the app starts; no stale saved USB path is used.
    void state.connector.scan();
    return wrapped;
};
exports.stop = engine => {
    const state = engines.get(engine);
    if (!state) return;
    clearInterval(state.timer);
    state.connector.stop();
    state.clients.clear();
    engines.delete(engine);
};
exports.SlbAutoConnect = SlbAutoConnect;
exports.isSlb = isSlb;
