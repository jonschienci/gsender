// Use only in the Android backend build. The runtime import is relative to
// the emitted server bundle, NOT the original source file or build machine.
module.exports = function androidUsbPlugin(runtimeImport) {
    if (typeof runtimeImport !== 'string' || !runtimeImport.startsWith('./')) {
        throw new TypeError('Provide a packaged relative import, e.g. ./android-usb/serialport.cjs');
    }
    return {
        name: 'gsender-android-usb',
        setup(build) {
            build.onResolve({ filter: /^serialport$/ }, () => ({
                path: runtimeImport,
                external: true,
            }));
        },
    };
};
