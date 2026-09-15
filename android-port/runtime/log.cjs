// Preserve operational messages; avoid verbose per-event console work in the Android build.
const noop = () => {};
module.exports = { error: console.error, warn: console.warn, info: console.info, verbose: noop, debug: noop, silly: noop };
