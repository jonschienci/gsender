'use strict';
// Native network/foreground lease. No network selection, process binding,
// discovery, credentials, or automatic reconnection crosses this bridge.
class WifiNetwork {
    constructor(send) { this.send = send; this.sequence = 0; this.current = null; this.foreground = null; }
    setForegroundListener(listener) {
        this.foregroundListener = listener;
        // Tablet touch jogging also needs native pause events without a Wi-Fi knob.
        this.send(JSON.stringify({host:'wifi',op:'observe',id:0}));
        if (this.foreground !== null) listener(this.foreground);
    }
    acquire(address, lost, signal) {
        if (this.current) return Promise.reject(Error('Wi-Fi lease already held'));
        return new Promise((resolve, reject) => {
            const c = { id: ++this.sequence, lost, resolve, reject, ready: false };
            this.current = c;
            c.timer = setTimeout(() => this.end(c, true), 1500);
            c.signal = signal; c.abort = () => this.end(c, false);
            signal?.addEventListener('abort', c.abort, { once: true });
            if (signal?.aborted) return this.end(c, false);
            try { this.send(JSON.stringify({ host: 'wifi', op: 'start', id: c.id, address })); } catch { this.end(c, true); }
        });
    }
    receive(message) {
        if (message.state === 'foreground') {
            this.foreground = message.visible === true;
            this.foregroundListener?.(this.foreground); return;
        }
        const c = this.current;
        if (!c || message.id !== c.id) return;
        if (message.state !== 'ready') return this.end(c, true, message.reason);
        if (c.ready) return;
        c.ready = true; clearTimeout(c.timer);
        c.resolve({
            connected: () => { if (this.current === c) this.send(JSON.stringify({ host: 'wifi', op: 'connected', id: c.id })); },
            release: () => this.end(c, false),
        });
    }
    end(c, failed, reason) {
        if (this.current !== c) return;
        this.current = null; clearTimeout(c.timer);
        c.signal?.removeEventListener('abort', c.abort);
        try { this.send(JSON.stringify({ host: 'wifi', op: 'stop', id: c.id })); } catch { /* Teardown still rejects locally. */ }
        if (!c.ready) c.reject(Error('Current Wi-Fi unavailable'));
        else if (failed) c.lost(reason);
    }
    close() { if (this.current) this.end(this.current, true); }
}
module.exports = { WifiNetwork };
