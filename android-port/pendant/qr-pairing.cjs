'use strict';
const { randomBytes } = require('node:crypto');
const { host } = require('./wifi-transport.cjs');
function decodeQr(value) {
    const fail = () => { throw Error('Not a supported knob pairing QR'); };
    if (typeof value !== 'string' || value.length > 98) return fail();
    const match = /^GSK1:([0-9A-F]{12}):([0-9.]{7,15}):([0-9A-F]{64})$/.exec(value);
    if (!match || match[0].length !== value.length || /^0{64}$/.test(match[3])) return fail();
    let address; try { address = host(match[2]); } catch { return fail(); }
    return { version:1, device:'wisecoco-'+match[1].toLowerCase(), host:address, port:58596, psk:match[3].toLowerCase() };
}
// A bounded reservation containing no pairing key or camera frames.
class ScanLease {
    constructor(now) { this.now = now; this.current = null; }
    active() { if (this.current && this.now() >= this.current.until) this.cancel(); return !!this.current; }
    begin(generation) {
        if (this.active()) throw Error('Another pairing scan is active');
        this.current = { token:randomBytes(16).toString('hex'), generation, until:this.now()+90000 };
        return this.current.token;
    }
    check(token, generation) {
        if (!this.active() || this.current.token !== token || this.current.generation !== generation)
            throw Error('Pairing scan expired or connection changed; scan again');
    }
    cancel(token) { if (token === undefined || this.current?.token === token) this.current = null; }
}
module.exports = { decodeQr, ScanLease };
