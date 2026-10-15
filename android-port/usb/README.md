# gSender Android USB module

An in-process Android library and Node serial adapter for the gSender Android port. The library keeps serial communication inside gSender's existing connection, parser and sender architecture; Android adaptations are scoped to this port.

## Implemented

- Android USB Host discovery through usb-serial-for-android 3.9.0, including descriptor-based CDC ACM discovery. STM32 SLBs (0483:5740) use the scoped read-health adapter described below; Pico and other drivers retain upstream read behavior.
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

Build 76 passed all **390 Android/backend regressions**, including **22 USB adapter/transport checks**. Release compilation, lint, payload/native-library verification and installed-APK checksum checks passed. The release was installed and launch-checked on the L1108 and K90. The user reported no connection issues during the latest L1108 job attempt; the passive capture shows a 164-second attachment, at least 294 tolerated empty reads and no health-probe closure. Complete long-job validation across all devices remains outstanding.

## STM32 empty-read handling (Build 76)

A CDC zero-length completion does not by itself end the serial stream. After a nonempty read, the STM32 adapter allows three seconds before an empty completion can trigger the read-only GET_STATUS checks. During continued silence, at most one three-attempt health-check sequence runs per second. Each attempt is limited to 200 ms; a closed/replaced handle or interruption cancels it. A 1 ms empty-read yield prevents a tight loop on a stale handle.

This change follows a physical Build 75 skull-job failure after 34.463 seconds: the driver closed on its health probe even though a valid serial reply had arrived 42 ms earlier. The new regression covers that ordering and continued data interleaved with empty completions.

Actual detach handling and upstream write/partial-write errors remain fatal. Serial commands are never retried by read recovery, and no job resumes automatically after disconnection. See [Build 76](../BUILD-76.md) for artifact identity, evidence and limitations.
