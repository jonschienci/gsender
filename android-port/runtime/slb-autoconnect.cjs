'use strict';

// Known SLB-family CDC identities: STM32 SLBs and Pico-based SLB-Lite.
// These MCU IDs are shared with other firmware; the normal GrblHAL connection
// handshake still applies. Match only the first serial port, never an entire
// USB vendor or a flashing/bootloader identity. Keep the Android filter in sync.
const SLB_USB_IDS = new Set(['0483:5740', '2e8a:000a']);
const isSlb = port => /^android-usb:\d+:0$/.test(port.path || '') &&
    SLB_USB_IDS.has(`${String(port.vendorId).toLowerCase()}:${String(port.productId).toLowerCase()}`);

class SlbAutoConnect {
    constructor({ list, getConnection, getOpener, report = () => {}, now = Date.now }) {
        Object.assign(this, { list, getConnection, getOpener, report, now });
        this.attachments = new Map();
        this.opening = null;
        this.scanning = false;
        this.stopped = false;
    }
    attachment(path) {
        if (!this.attachments.has(path)) this.attachments.set(path, { failures: 0, nextAt: 0, suppressed: false });
        return this.attachments.get(path);
    }
    suppress(path) { this.attachment(path).suppressed = true; }
    disconnected(path) {
        if (path && this.attachments.has(path)) {
            const record = this.attachment(path);
            record.nextAt = Math.max(record.nextAt, this.now() + 2000);
        }
    }
    open(opener, path, options, callback = () => {}) {
        if (this.stopped || this.opening) {
            callback(new Error(this.stopped ? 'USB autoconnect stopped' : 'A board connection is already in progress'));
            return;
        }
        const record = this.attachment(path);
        record.suppressed = false; // Explicit manual Connect overrides Disconnect.
        const attempt = {};
        this.opening = attempt;
        let settled = false;
        const done = error => {
            // Connection retains its callback and may call it again on close.
            // An old close must not release a newer permission/open request.
            if (settled) return;
            settled = true;
            if (this.opening === attempt) this.opening = null;
            if (error) {
                record.failures++;
                // Respect an explicit permission denial/abandoned manual prompt.
                // Automatic attempts never request permission and may retry once
                // Android grants access through its default-device handler.
                if (options.requestPermission !== false && ['EACCES', 'ETIMEDOUT'].includes(error.code)) record.suppressed = true;
            } else record.failures = 0;
            record.nextAt = this.now() + Math.min(30000, 2000 * 2 ** Math.min(4, Math.max(0, record.failures - 1)));
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
            for (const path of this.attachments.keys()) {
                if (!present.has(path)) this.attachments.delete(path);
            }
            const matches = ports.filter(isSlb);
            const open = this.getOpener();
            // Never replace an active/initializing controller or choose between
            // multiple boards. Retry transport failures with a bounded backoff.
            if (!open || this.opening || this.getConnection() || matches.length !== 1) return;
            const { path, usbPermission } = matches[0];
            const record = this.attachment(path);
            if (record.suppressed) return;
            if (usbPermission !== true) {
                if (!record.waitingPermission) this.report('SLB detected; waiting for Android USB access. Choose gSender as the default USB app or connect manually once.');
                record.waitingPermission = true;
                return;
            }
            record.waitingPermission = false;
            if (this.now() < record.nextAt) return;
            this.report('SLB auto-connect: requesting ' + path);
            open(path, { baudrate: 115200, network: false, defaultFirmware: 'GrblHAL', requestPermission: false }, error => {
                this.report(error ? 'SLB connection failed; will retry: ' + (error.message || error) : 'SLB connected automatically');
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
exports.disconnected = (engine, path) => engines.get(engine)?.connector.disconnected(path);
exports.SlbAutoConnect = SlbAutoConnect;
exports.isSlb = isSlb;
