'use strict';
// Only socket display copies are batched. Serial parsing, ACKs and sending stay
// synchronous in the controller. Older clients keep the original wire events.
exports.createSerialDisplay = (getSockets, timers = globalThis) => {
    let pending = [], bytes = 0, timer = null;
    const supports = socket => socket.handshake?.auth?.androidDisplayBatch === 1;
    const flush = () => {
        if (timer !== null) timers.clearTimeout(timer);
        timer = null;
        if (!pending.length) return;
        const lines = pending; pending = []; bytes = 0;
        for (const socket of Object.values(getSockets())) {
            if (supports(socket)) socket.emit('android:serial-batch', lines);
        }
    };
    return {
        emit(event, ...args) {
            const sockets = Object.values(getSockets());
            const buffered = event === 'serialport:read' && typeof args[0] === 'string'
                && args.length === 1 && !/^(?:error:|ALARM:)/i.test(args[0].trim());
            if (!buffered) {
                flush(); // Preserve ordering at state changes, errors and close.
                for (const socket of sockets) socket.emit(event, ...args);
                return;
            }
            for (const socket of sockets) if (!supports(socket)) socket.emit(event, ...args);
            if (!sockets.some(supports)) return;
            const size = Buffer.byteLength(args[0]);
            if (pending.length && (pending.length >= 128 || bytes + size > 65536)) flush();
            pending.push(args[0]); bytes += size;
            if (timer === null) timer = timers.setTimeout(flush, 100);
        },
        dispose() {
            if (timer !== null) timers.clearTimeout(timer);
            timer = null; pending = []; bytes = 0;
        }
    };
};
