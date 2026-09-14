# gSender Android USB module

An in-process Android library and Node serial adapter for the gSender Android port. This is not a separate USB app. gSender's SerialConnection, ReadlineParser, controller logic and sender remain unchanged.

## Implemented

- Android USB Host discovery through usb-serial-for-android 3.9.0 (including descriptor-based CDC ACM discovery); no guessed SLB USB ID or forced driver.
- Asynchronous Android USB permission request, denial, timeout and cancellation.
- Port IDs `android-usb:<deviceId>:<portNumber>` and serialport-style enumeration metadata. IDs are valid for the current attachment; they are not persistent identities.
- 115200 baud, 8N1 defaults, configurable baud/bits/parity/stops; DTR and RTS initially asserted once, with configurable initial levels and explicit `set()` support. No deliberate reset pulse. Verify the SLB's behavior with these signals on hardware.
- Binary-safe stream reads and ordered writes. A native write resolves only after the driver returns; timeout or partial write is fatal and never retried.
- Permission cancellation, detach, I/O errors, receive overflow and stale-session isolation.
- `SerialPort.list()`, constructor with optional autoOpen/callback, `open`, `close`, `write`, `pipe`, `set`, `destroy`, `isOpen`, and open/data/error/close events used by gSender's serial connection.

This is the API subset needed for normal controller communication, not a complete replacement for every serialport feature. Software/hardware flow control is rejected. Firmware flashing/DFU, `flush`, `drain`, `update`, and a reopen on a destroyed instance are not implemented. gSender's SerialConnection creates a new instance on reconnect.

## Android host integration

Include this directory as an Android library module, or build standalone with Gradle 8.9, JDK 17 and Android SDK 35:

```sh
gradle -p android-port/usb assembleDebug
```

The Gradle files pin Android Gradle Plugin 8.7.3 and usb-serial-for-android 3.9.0. The repository settings need Google, Maven Central and JitPack as shown in settings.gradle. The manifest declares USB Host support. No root access is needed.

Create exactly one `UsbSerialModule(applicationContext, output)` in the Android host service. Forward JSON strings from Node into `accept(json)`. Forward the module's `Output.send(json)` strings back into Node's subscribed callback. The Output may be called from native worker/read threads: the embedding binding must marshal these onto Node's event loop, preserve order and never block waiting for Node. Dispose the module with `close()` when the host service stops, not on Activity rotation.

The JNI/embedded-Node binding and Android service now live in ../app/. The USB library itself remains independent of that shell. Do not expose accept() to untrusted WebView content. No network USB bridge is used.

## gSender backend integration

Use `js/esbuild-plugin.cjs` only in the Android backend build to replace `serialport` imports:

```js
const usbPlugin = require('./android-port/usb/js/esbuild-plugin.cjs');
// In the backend bundle build configuration:
plugins: [usbPlugin('./android-usb/serialport.cjs')]
```

Copy `js/index.cjs` and `js/serialport.cjs` into `android-usb/` beside the emitted backend bundle. Before requiring that bundle, bootstrap the adapter:

```js
require('./android-usb/serialport.cjs').install({
    send: json => nativeBinding.send(json),
    subscribe: listener => nativeBinding.subscribe(listener),
});
require('./server.cjs');
```

`nativeBinding` above is the application shell's in-process binding, not an implemented global. `subscribe` must return an unsubscribe function. The build plugin accepts the packaged relative import explicitly so build-machine paths cannot leak into Android. The desktop build is unchanged. The parent Android project now supplies scoped backend adapters and an APK build.

## Bridge messages

Requests have an incrementing numeric `id` and `op`. `open` has a unique `session` and `options`; other port operations carry that session. `write` carries Base64 `data`; `set` carries `signals`. Native replies have the same `id` and either `result` or `error: {code, message}`. Unsolicited messages have `session` and either `event: "data"` with Base64 bytes, or `event: "close"` with an error. Base64 is only transport encoding; no G-code text conversion occurs.

Default request timeout is 15 seconds, permission timeout 120 seconds (native permission expiry 110 seconds), native write timeout 5 seconds. Reads buffer at most 1 MiB in the JS adapter and then fail closed; the host binding must also bound its own message queue. None of these are real-time emergency-stop guarantees.

## Tests and validation

```sh
cd android-port/usb
npm install
npm test
```

Fourteen tests passed, including an integration test that loads the unchanged upstream SerialConnection and actual ReadlineParser 11.0.0. All native responses in these tests are simulated. The Java source was separately compiled using JDK 17 against Android API 35 classes (Robolectric android-all 15-robolectric-12650502) and the actual usb-serial-for-android 3.9.0 AAR. This verifies Java/API compatibility, not native behavior or a Gradle APK/AAR build.

Not yet validated: tablet USB Host/adapter behavior, SLB enumeration and DTR/RTS behavior, permission broadcasts on-device, Android lifecycle under load, sustained real USB streaming, or disconnect recovery with the actual controller. The parent Android project now builds a debug APK; hardware validation remains outstanding.
