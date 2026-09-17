'use strict';
const path = require('node:path');
const fs = require('node:fs');
process.env.NODE_ENV = 'production';
process.env.GSENDER_LOCAL_TOKEN = require('node:crypto').randomBytes(32).toString('hex');
process.env.GSENDER_BUNDLE_DIR = __dirname;
process.env.GSENDER_USER_DATA = path.resolve(__dirname, '../data');
fs.mkdirSync(process.env.GSENDER_USER_DATA, { recursive: true });
process.env.TMPDIR = path.join(process.env.GSENDER_USER_DATA, 'tmp');
fs.mkdirSync(process.env.TMPDIR, { recursive: true });
process.chdir(process.env.GSENDER_USER_DATA);
const native = process._linkedBinding('gsender_usb');
const { WifiNetwork } = require('./wifi-network.cjs');
const wifi = process.gsenderWifi = new WifiNetwork(json => native.send(json));
const { BleNetwork } = require('./ble-network.cjs');
const ble = process.gsenderBle = new BleNetwork(json => native.send(json));
let serialReceive;
native.subscribe((json, queueAgeMs = 0) => {
    const message = JSON.parse(json);
    if (message.event === 'wifi') wifi.receive(message);
    else if (message.event === 'ble') ble.receive(message, queueAgeMs);
    else serialReceive?.(json);
});
const adapter = require('./android-usb/serialport.cjs').install({
    send: json => native.send(json),
    subscribe: fn => { serialReceive = fn; return () => { serialReceive = null; }; },
});
const fail = err => {
    native.send(JSON.stringify({ host: 'error', message: String(err?.stack || err) }));
    wifi.close(); ble.close(); adapter.dispose();
};
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
try {
    const { createServer } = require('./server.cjs');
    createServer({ host: '127.0.0.1', port: 8765, configFile: path.join(process.env.GSENDER_USER_DATA, 'settings.json'),
        allowRemoteAccess: false, verbosity: 0 }, (err, result) => {
        if (err) return fail(err);
        native.send(JSON.stringify({ host: 'ready', port: result.port, token: process.env.GSENDER_LOCAL_TOKEN }));
    });
} catch (err) { fail(err); }
