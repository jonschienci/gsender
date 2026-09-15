'use strict';
const tls = require('node:tls');
const { isIP } = require('node:net');
const { EventEmitter } = require('node:events');
const { performance } = require('node:perf_hooks');
const CIPHER = 'PSK-AES128-GCM-SHA256';
const PORT = 58596;

function host(value) {
    if (typeof value !== 'string' || isIP(value) !== 4) throw Error('Enter a numeric IPv4 address for the knob');
    const octets = value.split('.').map(Number);
    if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224 || octets.every(n => n === 255))
        throw Error('Use the knob address on the current Wi-Fi network');
    return value;
}
function pairing(text, override) {
    let value;
    try {
        if (typeof text !== 'string' || text.length > 2048) throw Error();
        value = JSON.parse(text);
        if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'device,host,port,psk,version' ||
            value.version !== 1 || value.port !== PORT || !/^wisecoco-[0-9a-f]{12}$/.test(value.device) ||
            typeof value.psk !== 'string' || !/^[0-9a-f]{64}$/.test(value.psk) || /^0{64}$/.test(value.psk)) throw Error();
    } catch { throw Error('Invalid pairing JSON; use the file generated over USB'); }
    return { device: value.device, host: host(override || value.host), port: PORT, psk: Buffer.from(value.psk, 'hex') };
}

// A single bounded P2 stream. Transport errors never include TLS messages,
// pairing input, identity hints, credentials or remote-provided error text.
class WifiPort extends EventEmitter {
    #pairing;
    constructor(config, { network, dial = options => tls.connect(options), now = () => performance.now() } = {}) {
        super();
        this.#pairing = { ...config, psk: Buffer.from(config.psk) };
        this.path = `wifi:${config.device}`;
        this.network = network; this.dial = dial; this.now = now;
        this.isOpen = false; this.destroyed = false; this.pending = null;
    }
    async open(callback) {
        if (this.openCallback || this.destroyed || this.isOpen) return callback(Error('Wi-Fi connection already used'));
        this.openCallback = callback;
        this.abort = new AbortController();
        this.openTimer = setTimeout(() => this.fail('Wi-Fi connection timed out'), 5000);
        try {
            if (!this.network) throw Error();
            const lease = await this.network.acquire(this.#pairing.host, () => this.fail('Wi-Fi network or foreground access lost'), this.abort.signal);
            if (this.destroyed) { lease.release(); return; }
            this.lease = lease;
            this.socket = this.dial({
                host: this.#pairing.host, port: this.#pairing.port,
                minVersion: 'TLSv1.2', maxVersion: 'TLSv1.2', ciphers: CIPHER,
                pskCallback: () => ({ identity: this.#pairing.device, psk: this.#pairing.psk }),
                // PSK authenticates the peer; this suite cannot negotiate a certificate.
                checkServerIdentity: () => undefined, rejectUnauthorized: true,
                highWaterMark: 1024,
            });
            const socket = this.socket;
            socket.setNoDelay(true);
            socket.once('secureConnect', () => {
                if (this.destroyed) return;
                if (!socket.authorized || socket.getProtocol() !== 'TLSv1.2' || socket.getCipher()?.name !== CIPHER)
                    return this.fail('Wi-Fi authentication failed');
                // Renegotiation is never needed for one P2 ownership session.
                socket.disableRenegotiation();
                this.isOpen = true; clearTimeout(this.openTimer);
                lease.connected();
                const done = this.openCallback; this.openCallback = null; done?.();
            });
            socket.on('data', bytes => {
                if (!this.isOpen || this.destroyed) return;
                // Bound one callback's protocol work; an abnormal flood closes the link.
                if (bytes.length > 4096) return this.fail('Wi-Fi receive limit exceeded');
                this.emit('data', bytes);
            });
            socket.on('error', () => this.fail('Wi-Fi connection or authentication failed'));
            socket.once('end', () => this.fail('Wi-Fi knob disconnected; reconnect manually'));
            socket.once('close', () => this.destroy());
        } catch { this.fail('Wi-Fi connection unavailable; check pairing and the current network'); }
    }
    write(bytes, callback) {
        if (!this.isOpen || this.destroyed) { callback(Error('Wi-Fi knob is disconnected')); return false; }
        if (this.pending || this.socket.writableLength || !Buffer.isBuffer(bytes) || bytes.length > 256 ||
            !/^P2 STATE [ -~]+\n$/.test(bytes.toString('utf8'))) {
            callback(Error('Wi-Fi write rejected'));
            this.fail('Wi-Fi write queue or frame rejected'); return false;
        }
        const write = { callback, at: this.now() }; this.pending = write;
        // A callback after the deadline is a failure even if the timer was delayed.
        write.timer = setTimeout(() => this.fail('Wi-Fi write stalled'), 100);
        try {
            this.socket.write(bytes, err => {
                if (this.pending !== write) return;
                if (err || this.now() - write.at >= 100) return this.fail('Wi-Fi write stalled');
                clearTimeout(write.timer); this.pending = null; callback();
            });
        } catch { this.fail('Wi-Fi write failed'); }
        return !this.destroyed;
    }
    fail(message) {
        if (this.destroyed) return;
        const error = Error(message), done = this.openCallback;
        this.openCallback = null;
        // Notify the service before close so it preserves the useful generic reason.
        if (this.listenerCount('error')) this.emit('error', error);
        this.destroy(); done?.(error);
    }
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true; this.isOpen = false;
        clearTimeout(this.openTimer); this.abort?.abort();
        const pending = this.pending; this.pending = null;
        if (pending) { clearTimeout(pending.timer); pending.callback(Error('Wi-Fi write cancelled')); }
        const done = this.openCallback; this.openCallback = null;
        this.socket?.destroy(); this.lease?.release(); this.lease = null;
        this.#pairing.psk.fill(0);
        done?.(Error('Wi-Fi connection cancelled'));
        this.emit('close');
    }
}
module.exports = { pairing, host, WifiPort, CIPHER, PORT };
