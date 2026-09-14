'use strict';
// Android-only esbuild alias for `serialport`. Install the in-process bridge
// before importing the gSender backend; desktop builds do not use this file.
const { createSerialPort } = require('./index.cjs');
let installed;
exports.install = (transport) => {
    if (installed) throw new Error('Android USB bridge already installed');
    installed = createSerialPort(transport);
    return installed;
};
Object.defineProperty(exports, 'SerialPort', {
    enumerable: true,
    get() {
        if (!installed) throw new Error('Install the Android USB bridge before loading gSender');
        return installed.SerialPort;
    },
});
