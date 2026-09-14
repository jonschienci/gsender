'use strict';
const { Duplex } = require('node:stream');
const { randomUUID } = require('node:crypto');

const failure = (code, message) => Object.assign(new Error(message), { code });

// send/subscribe carry JSON strings across the embedded Node <-> Java boundary.
// subscribe returns an unsubscribe function. Delivery must be ordered and async.
function createSerialPort({ send, subscribe, timeout = 15000, permissionTimeout = 120000 }) {
    let nextId = 0;
    const pending = new Map();
    const ports = new Map();
    let disposed = false;
    const request = (op, args = {}, wait = timeout) => new Promise((resolve, reject) => {
        if (disposed) return reject(failure('ESHUTDOWN', 'USB bridge is disposed'));
        const id = ++nextId;
        const timer = setTimeout(() => {
            pending.delete(id);
            reject(failure('ETIMEDOUT', `USB ${op} timed out`));
        }, wait);
        pending.set(id, { resolve, reject, timer });
        try { send(JSON.stringify({ id, op, ...args })); }
        catch (err) { clearTimeout(timer); pending.delete(id); reject(err); }
    });
    const unsubscribe = subscribe((message) => {
        let msg;
        try { msg = JSON.parse(message); } catch { return; }
        if (msg.id !== undefined) {
            const call = pending.get(msg.id);
            if (!call) return;
            pending.delete(msg.id);
            clearTimeout(call.timer);
            if (msg.error) call.reject(failure(msg.error.code, msg.error.message));
            else call.resolve(msg.result);
            return;
        }
        const port = ports.get(msg.session);
        if (!port || port.destroyed || (!port.isOpen && !port.opening)) return;
        if (msg.event === 'data') {
            const bytes = Buffer.from(msg.data, 'base64');
            if (port.readableLength + port.earlyBytes + bytes.length > 1024 * 1024) {
                port.destroy(failure('EOVERFLOW', 'USB receive buffer exceeded 1 MiB'));
            } else if (port.opening) {
                port.early.push(bytes); port.earlyBytes += bytes.length;
            } else port.push(bytes);
        } else if (msg.event === 'close') {
            // serialport reports unplug via close(error), not an unhandled stream error.
            port.disconnectError = Object.assign(failure(msg.error?.code || 'ENODEV',
                msg.error?.message || 'USB disconnected'), { disconnected: true });
            port.destroy();
        }
    });

    class SerialPort extends Duplex {
        static list() { return request('list'); }
        constructor(options, callback) {
            super({ autoDestroy: false, emitClose: false });
            if (!options || typeof options.path !== 'string') throw new TypeError('path is required');
            this.settings = { baudRate: 115200, dataBits: 8, stopBits: 1, parity: 'none', dtr: true, rts: true, ...options };
            this.path = options.path;
            this.isOpen = false;
            this.opening = false;
            this.session = randomUUID();
            this.closeEmitted = false;
            this.early = [];
            this.earlyBytes = 0;
            ports.set(this.session, this);
            if (options.autoOpen !== false) queueMicrotask(() => this.open(callback));
        }
        _read() {}
        open(callback) {
            if (this.opening || this.isOpen || this.destroyed) {
                const err = failure('EBUSY', 'Port is open, opening, or destroyed');
                queueMicrotask(() => callback ? callback(err) : this.emit('error', err));
                return;
            }
            this.opening = true;
            request('open', { session: this.session, options: this.settings }, permissionTimeout).then(() => {
                this.opening = false;
                if (this.destroyed) { callback?.(failure('ECANCELED', 'Open canceled')); return; }
                this.isOpen = true;
                this.emit('open');
                callback?.(null);
                for (const bytes of this.early) { if (!this.destroyed) this.push(bytes); }
                this.early = []; this.earlyBytes = 0;
            }, (err) => {
                this.opening = false;
                this.early = []; this.earlyBytes = 0;
                // Cancel pending permission/open, including late success after timeout.
                request('close', { session: this.session }).catch(() => {});
                if (callback) callback(err);
                else this.emit('error', err);
            });
        }
        _write(bytes, encoding, callback) {
            if (!this.isOpen) return callback(failure('ENOTCONN', 'Port is not open'));
            const maxQueueMs = this.nextWriteDeadline || this.settings.writeDeadlineMs;
            this.nextWriteDeadline = undefined;
            if (maxQueueMs !== undefined && maxQueueMs !== 250) return callback(failure('EINVAL', 'Unsupported write deadline'));
            // Fail closed after a partial/failed write; never retry motion bytes.
            request('write', { session: this.session, data: bytes.toString('base64'), ...(maxQueueMs ? {maxQueueMs} : {}) }).then(
                () => callback(),
                (err) => { callback(err); this.destroy(err); },
            );
        }
        writeBounded(bytes, callback) {
            // Pendant-only finite command. Never enqueue it behind old stream data.
            if (!this.isOpen || this.writableLength !== 0 || this.writableCorked || this.nextWriteDeadline)
                return queueMicrotask(() => callback(failure('EBUSY', 'CNC USB write queue is not empty')));
            if (!/^\$J=G21G91 [XYZ]-?\d+\.\d{4} F\d+\.\d{3}\n$/.test(Buffer.from(bytes).toString('ascii')))
                return queueMicrotask(() => callback(failure('EINVAL', 'Not a finite pendant jog')));
            this.nextWriteDeadline = 250;
            this.write(bytes, callback);
        }
        set(signals, callback) {
            const done = callback || ((err) => { if (err) this.emit('error', err); });
            if (!this.isOpen) return queueMicrotask(() => done(failure('ENOTCONN', 'Port is not open')));
            request('set', { session: this.session, signals }).then(() => done(null), done);
        }
        close(callback) {
            if (this.destroyed) {
                queueMicrotask(() => callback?.(failure('ENOTCONN', 'Port is closed')));
                return;
            }
            if (callback) this.once('close', (err) => callback(err || null));
            this.destroy();
        }
        _destroy(err, callback) {
            const wasActive = this.isOpen || this.opening;
            this.isOpen = false;
            this.opening = false;
            ports.delete(this.session);
            this.early = []; this.earlyBytes = 0;
            request('close', { session: this.session }).then(() => finish(err), (closeError) => finish(err || closeError));
            const finish = (reason) => {
                callback(reason);
                // Match serialport: close(error), rather than Node's close(boolean).
                if (!this.closeEmitted) {
                    this.closeEmitted = true;
                    queueMicrotask(() => this.emit('close', wasActive ? (this.disconnectError || reason) : null));
                }
            };
        }
    }
    return {
        SerialPort,
        dispose() {
            for (const port of ports.values()) port.destroy(failure('ESHUTDOWN', 'USB bridge stopped'));
            disposed = true;
            unsubscribe();
            for (const call of pending.values()) {
                clearTimeout(call.timer);
                call.reject(failure('ESHUTDOWN', 'USB bridge stopped'));
            }
            pending.clear();
        },
    };
}
module.exports = { createSerialPort };
