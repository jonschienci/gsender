// Isolated test process only: simulated Android lease + existing USB CNC emulator.
require('./pendant-native.cjs');
const binding = process._linkedBinding('gsender_usb');
let receive, lease;
process._linkedBinding = name => {
    if (name !== 'gsender_usb') throw Error('Unexpected binding');
    return {
        subscribe(fn) { receive = fn; binding.subscribe(fn); },
        send(json) {
            const message = JSON.parse(json);
            if (message.host !== 'wifi') return binding.send(json);
            if (message.op === 'start') {
                lease = message.id;
                queueMicrotask(() => receive(JSON.stringify({ event:'wifi', id:lease, state:'ready' })));
            }
            if (message.op === 'stop') lease = null;
        },
    };
};
process.on('message', message => {
    if (message.test === 'wifi-lost' && lease) receive(JSON.stringify({ event:'wifi', id:lease, state:'lost' }));
});
// Real TLS with only the target address changed to this test's loopback listener.
const tls = require('node:tls'), connect = tls.connect;
tls.connect = options => connect({ ...options, host:'127.0.0.1', port:Number(process.env.TEST_WIFI_PORT) });
