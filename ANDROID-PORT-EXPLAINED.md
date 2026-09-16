# Android port: integration notes for gSender maintainers

## Reference build and source state

**Build 30 — `1.7.0-dev-android.30-node24-prototype`**, completed 2026-09-16. Package `com.gsender.android`, API 26 minimum / 35 target, optimized release APK, **armeabi-v7a only**, embedded Node **24.21.0**. APK SHA-256: `e4fad742fc4aa403770597459394f62b7dc3841723c08813a39c1a9cc6f3e590`.

Upstream base remains `dev` commit `8a4a5dd4506d5901f0c6c395a11fde53be4ebbd9`. All 1,421 recorded upstream files still match `android-port/upstream.json`; Android changes are separate files and bundle-time transforms.

The Build 30 source is the working tree on **`android-node24-prototype`**, based on `323f5b055262febb68df62e176f496f3f9f529c5` (Build 26). Builds 27–30 were integrated without commits. The Build 30 report, 34-file hash manifest and source delta identify the final integration; that delta alone does not reconstruct the preceding uncommitted builds. This documentation commit does not publish those implementation changes. File references below describe that Build 30 working tree, not the older `android-port` code snapshot.

## Runtime and platform boundary

Java `MainActivity` hosts the WebView; `EngineService` embeds Node on a dedicated thread in the application process. CMake builds `libgsender_bridge.so` against the selected `libnode.so`; `libc++_shared.so` is also packaged. This replaces Electron without adding a remote server or separate USB helper.

Build 30 uses upstream Node cross-compiled on Linux x86_64 with NDK 27.2.12479018 and 32-bit V8 host tools. `node-lts/` pins source hashes and the V8 ARM C++ parsing patch. OpenSSL assembly, Node's startup snapshot and Node code cache are disabled; V8's startup snapshot remains enabled. `-PnodeRuntimeRoot=… -PnodeRuntimeAbis=armeabi-v7a` selects this runtime and C++20 JNI compilation. Without those properties, Gradle still selects the legacy Node.js Mobile 18.20.4 / C++17 build; that is not the distributed Build 30 runtime.

JNI exposes `process._linkedBinding('gsender_usb')`. Java callbacks enter V8 through a bounded `uv_async` queue, carrying JSON/Base64 payloads and monotonic queue age. Bootstrap multiplexes serial, Wi-Fi and BLE events to separate adapters. V8 old-space is capped at **768 MiB**, a growth ceiling rather than preallocation or total-process memory limit.

The tested Lenovo runs 32-bit Android 11 despite its CPU capabilities. Other tablets need ABI, WebView, USB-host and native-library/page-size validation. No custom ROM is required or bundled. Separate Lenovo tuning disables selected background apps/animations and adjusts power settings; those reversible device settings are not APK behavior or evidence of a portable custom Android image.

## USB adapter and automatic SLB connection

`usb/js/esbuild-plugin.cjs` substitutes a Duplex adapter for `serialport`; `UsbSerialModule.java` uses Android USB Host and `usb-serial-for-android 3.9.0`. The adapter implements the consumed API subset. Requests have IDs and port-session IDs; unsolicited data/close events are session-scoped. Attachment paths are `android-usb:<device ID>:<port>` and are rediscovered after reattachment.

Writes resolve after driver completion; partial writes are never retried. Detach emits `close(error)` with `disconnected=true`, avoiding the extra fatal stream error introduced by the former detach `destroy(error)` path. Initial DTR/RTS are asserted without a reset pulse. JNI input and JS receive buffers are bounded to 2 MiB and 1 MiB respectively. Permission handling covers cancellation, timeout, delayed callbacks and missed detach events.

SLB autoconnect requires exactly one eligible `0483:5740` first serial interface, existing Android permission, authenticated UI, and no active/pending controller connection. Android's USB intent reuses the Activity. Same-address failures retry with 2–30 s backoff; automatic attempts never open permission dialogs. Manual Disconnect suppresses that attachment until replug, while manual Connect remains available. Discovery excludes the knob. Connection recovery does not resume jobs or issue motion/unlock/homing commands.

Knob/tablet jog writes use `writeBounded` and `WriteDeadline.java`: **250 ms queue-plus-driver budget**, with expired work rejected before transmission. Ordinary CNC writes retain the upstream path. Firmware flashing is rejected before controller reset/close; unused flow-control operations remain unsupported.

## Bundle transforms, storage and lifecycle

`build-backend.cjs` substitutes Electron paths/logging, private home/i18n paths, flash handlers and local server integration. Checked source anchors fail the build when upstream changes; Vite's plain CSS/HTML substitutions also require inspection. Runtime packages remain external to esbuild and must be present in the pinned `runtime-deps/` manifest/lockfile. Explicit `acorn`/`acorn-walk` dependencies fix the earlier on-device startup failure.

The service replaces hashed payload files under private `files/runtime`, keeping settings under `files/data`. Both UI variants use `http://127.0.0.1:8765`. Each process generates a fresh credential; the Activity awaits `CookieManager.setCookie` before navigation. HTTP and Socket.IO authenticate it, bootstrap HTML is non-cacheable, and initial navigation has a unique query. This prevents the earlier cached-UI/stale-cookie failure where USB was visible to Android but no open request reached Java. Persisted remote-mode settings cannot change the loopback bind.

A foreground service and USB-active wake lock support backend operation. Recents removal closes transports and terminates the process, with a 1.5 s cleanup fallback; Node is initialized once per process. Home/background preserves the CNC service but cancels owned auxiliary jogging and revokes arming. Native visibility events reach the tablet pad even without a connected knob. Android document pickers replace desktop dialogs; the export bridge limits encoded transfers to 48 MiB.

## Frontend integration and performance

Both upstream frontends are compiled. Startup reads the existing `sienci` preference `state.workspace.usePendantViewAsDefault` and redirects locally. Android viewport fitting uses 1280 CSS pixels in landscape, 800 in pendant portrait, with pinch disabled. Knob controls share an explicit horizontal row beside board connection; their lazily loaded modal makes the underlying UI inert. Packaging injects the Gradle build number before React loads, and both headers display it.

Android transforms stabilize SVG visualizer options so position updates avoid rebuilding toolpaths. Progress reuses parsed totals or counts nonblank lines in cancellable 32 KiB tasks. Hidden knob-panel polling pauses while required UI heartbeats remain active. Disabled log formatting is skipped. Release shrinking retains JNI names, WebView methods and reflected USB-driver constructors. Earlier component/device probes validate these mechanisms, not full-job throughput or tablet frame rate.

## Motion ownership: knob and tablet pad

The optional knob remains a second endpoint; the CNC stays on USB. Exact STEP is the default (0–10 mm, 0.1 mm grid), host-acknowledged before accepting detents. P2 validates sessions, sequence/tickets, captured axis/distance and completion. Adaptive mode derives speed from firmware source intervals, blends saved Precision toward Rapid under axis limits, and sends finite segments rather than indefinite jog commands. Existing STEP ownership/ACKs transfer without resending distance. Page capability and generation checks prevent old page input from arming new controls.

Physical-knob touch hold requires continuing source contact reports, not a latched press. Freshness, controller status, visible UI, idle workflow, feeder state and single motion ownership gate input. New fast motion is limited to 120 ms nominal queued travel; cancellation drains receipts and waits for fresh Idle evidence. An already-authorized long exact STEP may exceed that horizon during adaptive handoff. These are software queue bounds, not physical stopping times.

The new persistent **XY controls** selector offers buttons or `ui/XYJogPad.tsx` in both frontends. The pad is independent of the external knob and keeps Z/rotary controls; rotary mode disables the pad. A 6% dead zone and smoothstep curve map radius to saved Rapid feed, with normalized diagonals and board limits. One touch owns motion and disarms the physical knob. Updates run every 40 ms, at most one outstanding, using a single-use 150 ms challenge; the backend expires contact after 200 ms. Release, reversal/center, lost capture, multitouch, background, settings changes and competing controls cancel. No lost contact automatically resumes.

## Bluetooth transport and recovery

Build 30 offers **USB by default or Bluetooth**; legacy Wi-Fi remains in source/API/tests for rollback. Scan the matching firmware's **PAIR BLUETOOTH** QR (the APK abbreviates it “PAIR BT QR”). Camera/discovery permissions are native Android concerns. QR identity and a 256-bit pre-shared key authenticate the application link; no OS Bluetooth bond is used. Credentials live only in process memory, so restart requires rescanning.

Java owns GATT and ciphertext; Node/OpenSSL performs mutual HMAC-SHA256 proof, HKDF-SHA256 derivation and directional AES-256-GCM protection for P2 frames. Strict sequence counters reject replay; the advertisement is not authentication. MTU must be at least 247, packets carry one bounded P2 line, and only one response-write is outstanding. Native queues expire after 50 ms, response writes after 100 ms; JNI queue age prevents delayed input appearing fresh. Setup/authentication deadlines are separate from the established 250 ms heartbeat lease. No new crypto/Bluetooth library is added.

Initial arming is manual. Transient BLE loss cancels/discards motion and reconnects while visible. A previously armed setting can be restored only after fresh status, cancellation receipts, unchanged controller/boot/page/settings/UI and at least 300 ms continuously fresh neutral-input proof. New tickets are issued; old motion never replays. Manual disarm/disconnect, background, alarms, authentication/protocol failures or changed context revoke retained arming. USB retains manual knob reconnection. See `pendant/BLE.md`, `RECONNECT.md`, `RAPID.md`, `CONTROL-PAGES.md` and `TABLET-XY-PAD.md` for contracts; older “pending” headings in the latter document predate its Build 30 inclusion.

## Packaging and validation

Build backend and **both** Vite frontends before packaging. Payload assembly replaces dependencies, excludes native desktop `.node` modules/test fixtures, and generates the embedded ZIP/hash. Use JDK 17 and serial test execution (`--test-concurrency=1`; fixtures share port 8765). For Build 30, supply the explicit Node 24 runtime properties to release assembly/lint and verify the APK with `--abi armeabi-v7a --runtime-version 24.21.0`; the default build script alone selects the legacy runtime. Preserve the signing key and retain release mapping/provenance artifacts. Increment Gradle and backend version metadata together.

Build 30 logs report **202/202 tests passed**, both frontend builds and Gradle release assembly/lint passed, with existing lint warnings. Packaged-backend tests extract the actual ZIP outside the checkout and disable global dependency lookup. BLE tests use real encryption with simulated GATT/CNC, including finite jog, cancellation/recovery and replay rejection; public vectors match independent Python and peer ESP implementations.

This documentation update independently verified APK version/ABI/runtime metadata, APK/payload hashes, all 34 recorded integration-file hashes, and all 1,421 upstream hashes. It did not rebuild or rerun the suite. Build 30 was not installed on the tablet, and matching ESP firmware was not flashed during its build. Camera/radio permissions, touch-report cadence, physical timing, sustained CNC streaming and lifecycle under load remain hardware-validation work. Earlier isolated Node/JNI/heap probes and earlier SLB control tests do not establish those results for Build 30.
