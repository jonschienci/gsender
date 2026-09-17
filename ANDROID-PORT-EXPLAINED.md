# Android port: integration notes for gSender maintainers

## Reference build and source state

**Build 37 — `1.6.4-android.37-node24-prototype`**, completed 2026-09-17. Package `com.gsender.android`, API 26 minimum / 35 target, optimized release APK, **armeabi-v7a only**, embedded Node **24.21.0**. APK SHA-256: `f91f876bbfd6728dca0e27d30b52e39099a253108054015e023e17a1976631c7`.

Source snapshot: `400abaacf6292b11a73a623d4a8e2a13bb2a24df` on **`android-node24-prototype`**. This commits the intervening Builds 27–37; the previous note's uncommitted-source warning no longer applies. The base is now stable **v1.6.4** (`eb2df2d2073d9dd1a762c0ed150d9be19360cf49`), with scoped jogging/joystick and pendant overlays from dev `a45b81aeca15b6d138fcc21105fbcf55aad5315a`. Dev plugins and unrelated dev features are excluded.

`android-port/upstream.json` records overlay paths, compatibility changes and 1,261 source hashes, all verified during this update. Those hashes describe the assembled hybrid, not an untouched single upstream release. Android runtime/UI adaptations still use separate modules and build-time transforms. Paths below are relative to `android-port/` unless stated otherwise.

## Runtime and platform boundary

Java `MainActivity` hosts the WebView; `EngineService` embeds Node on a dedicated thread in the application process. CMake builds `libgsender_bridge.so` against the selected `libnode.so`; `libc++_shared.so` is also packaged. This replaces Electron without adding a remote server or separate USB helper.

Build 37 uses upstream Node cross-compiled on Linux x86_64 with NDK 27.2.12479018 and 32-bit V8 host tools. `node-lts/` pins source hashes and the V8 ARM C++ parsing patch. OpenSSL assembly, Node's startup snapshot and Node code cache are disabled; V8's startup snapshot remains enabled. `-PnodeRuntimeRoot=… -PnodeRuntimeAbis=armeabi-v7a` selects this runtime and C++20 JNI compilation. Without those properties, Gradle still selects the legacy Node.js Mobile 18.20.4 / C++17 build; that is not the distributed Build 37 runtime.

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

The stable desktop frontend and overlaid dev pendant are compiled separately. Compatibility changes add the pendant preference, console-clear action and parking export, and isolate pendant theme/rapid-position helpers from unavailable dev dependencies. Startup reads the existing `sienci` preference `state.workspace.usePendantViewAsDefault` and redirects locally. Android viewport fitting uses 1280 CSS pixels in landscape, 800 in pendant portrait, with pinch disabled. Knob controls share an explicit horizontal row beside board connection; their lazily loaded modal makes the underlying UI inert. Packaging injects the Gradle build number before React loads, and both headers display it.

Android transforms stabilize SVG visualizer options so position updates avoid rebuilding toolpaths. Progress reuses parsed totals or counts nonblank lines in cancellable 32 KiB tasks. Hidden knob-panel polling pauses while required UI heartbeats remain active. Disabled log formatting is skipped. Release shrinking retains JNI names, WebView methods and reflected USB-driver constructors. Pendant jog buttons reserve the touch gesture; pointer/touch cancellation and lost capture clear the long-press timer and stop an active hold. This closes the reproduced delayed-jog-after-cancellation defect. Existing hold threshold and native haptics are retained. Earlier component/device probes validate individual mechanisms, not full-job throughput or tablet frame rate.

## Motion ownership: knob and tablet pad

The normal jog buttons/joystick use the pinned dev `JogStreamer`. Android knob and tablet XY controls retain their finite-command path through the same CNC USB owner. A new dev stream is rejected while auxiliary motion/cancellation receipts remain outstanding, preventing ACK ownership from crossing control paths.

**Knob:** Adaptive Precision → Rapid is now the default; Exact STEP remains selectable (0–10 mm, 0.1 mm grid). The normal panel has no Arm/Disarm buttons. INPUT-v1 firmware, visible UI, valid mm presets/axis limits, fresh idle CNC state, empty queues and 300 ms fresh neutral evidence permit automatic readiness. Page/axis/STEP/mode/settings, control-owner or connection changes revoke current motion and require fresh release evidence. Legacy firmware is display-only in this flow.

`P2 INPUT` replaces the earlier ALIVE/PCAP/NCAP/VCAP/WHEEL/DETENT bursts with one boot/session/ticket/context-bound snapshot. It includes monotonic sample and turn counters, neutral state, selection/STEP/page, source period and age. Firmware constructs the latest snapshot after a busy BLE sender drains instead of queueing old frames. New contexts start with zero counters; mixed directions are discarded, repeated counters cannot renew motion, and expected enable-context acknowledgements prevent readiness oscillation. Snapshot rates are bounded to 50 Hz active / 25 Hz idle; ticket freshness is 100 ms and input lease 250 ms. Physical XY still uses PAD and requires continuing source-contact reports.

Knob adaptive motion uses finite 60 ms segments with a 120 ms nominal queue budget and ACK/position evidence. An already-authorized long exact STEP may exceed that horizon during handoff; it is adopted without retransmission. Exact mode keeps an eight-turn expiring queue. These knob limits differ from the tablet pad below.

**Tablet XY:** The persistent Jog buttons / XY pad switch appears in both frontends. `ui/XYJogPad.tsx` retains Z/rotary controls but disables the pad in rotary mode. A 6% dead zone and smoothstep radius map to Rapid feed with normalized diagonals and axis limits. One touch owns motion and disables the physical knob. Its fresh neutral disable acknowledgement is accepted without cancelling the tablet; actual knob changes or held/not-ready acknowledgements still stop it. Readiness is sampled before issuing its own status query, avoiding the earlier self-created busy-USB condition.

Input updates run every 40 ms, at most one outstanding, with a **single-use 250 ms challenge and 250 ms motion-input lease**. An input stall cancels queued motion but can retain the finger session for up to **2 s**. A late packet is discarded and receives a new challenge; the UI immediately resamples the still-held finger. Only fresh input after drained cancellation receipts and fresh Idle can resume. Two seconds is contact retention, not permitted queued motion. Replay, invalid vectors, longer absence, release/capture loss, multitouch, background, settings changes, CNC faults or competing controls end contact; late replies cannot revive it.

The tablet queue is acceleration-aware: **180–500 ms nominal travel**, at most nine finite 60 ms segments and one unacknowledged write. Position evidence, not elapsed time alone, permits replenishment. Center/reversal cancels rather than draining the old direction. Motor-step/report rounding tolerance is capped at 0.05 mm; rounded endpoints retire only after all receipts and a subsequent fresh Idle. Stop reasons persist until the next valid center press. These software horizons are not physical stopping-time guarantees; slower acceleration can still limit achieved feed.

## Bluetooth transport and recovery

USB remains the default knob transport; Bluetooth is the normal wireless alternative and the CNC remains on USB. Legacy Wi-Fi code remains for rollback. Scanning **PAIR BLUETOOTH** stores QR identity/key in process memory and connects automatically; restart requires rescanning. INPUT-v1 readiness replaces Build 30's manual arming/retained-arm flow.

**Build 37 does not scan for Bluetooth devices.** GSB1 carries the ESP32-C6 Wi-Fi STA/base identity; the shipped four-universal-MAC firmware derives its public Bluetooth address by adding 2 to the final octet modulo 256, without carry. Android calls `getRemoteDevice(...).connectGatt(...)` directly and still validates service/characteristics/MTU and QR-key authentication. This firmware-specific mapping needs a versioned QR containing the actual address if future firmware uses custom/random addressing. The current matching knob needs no additional firmware update for this connection change.

The APK declares no location permission/feature, Bluetooth SCAN or legacy Bluetooth ADMIN. Android 8–11 use install-time Bluetooth permission; Android 12+ request CONNECT/Nearby devices. Camera permission remains necessary for QR scanning. Location Services can stay off; no OS Bluetooth bond is used.

Java handles GATT/ciphertext; Node/OpenSSL implements mutual HMAC-SHA256 proof, HKDF-SHA256 and directional AES-256-GCM with strict sequence/replay checks. MTU must be at least 247; packets hold one bounded P2 line with one response-write outstanding. Native queues expire after 50 ms, response writes after 100 ms; JNI queue age prevents stalled input appearing fresh. The address selects a peer, but the QR key authenticates it. No new crypto/Bluetooth library is added.

Wireless loss cancels/discards owned motion and reconnects with bounded backoff while visible. Authentication silence may retry; invalid proof/ciphertext replay stops retries. A healthy firmware reboot establishes new crypto/P2 sessions. Readiness requires new neutral/CNC evidence and resolved old receipts; no pre-loss motion replays. Disconnect stops retries. See `pendant/INPUT.md`, `BLE.md` and `TABLET-XY-PAD.md` for current contracts; older manual-arming sections are historical.

## Packaging and validation

Build backend and **both** Vite frontends before packaging. Vite runs with `--configLoader native` to avoid the bundled config loader’s CommonJS `node:path` failure. Payload assembly replaces dependencies, excludes native desktop `.node` modules/test fixtures, and generates the embedded ZIP/hash. Use JDK 17 and serial test execution (`--test-concurrency=1`; fixtures share port 8765). For Build 37, supply the explicit Node 24 runtime properties to release assembly/lint and verify the APK with `--abi armeabi-v7a --runtime-version 24.21.0`; the default build script alone selects the legacy runtime. Preserve the signing key and retain release mapping/provenance artifacts. Increment Gradle and backend version metadata together.

Build 37 logs record **257/257 Android regression tests**, both UI builds, release assembly/lint (zero errors; existing warnings), and finished-APK simulated-backend recovery tests. Coverage includes stale-touch cancellation/resampling, fresh direction after recovery, release races in the actual React component, standalone XY and knob handover, direct-address validation and octet wrap. Packaged tests extract the actual ZIP outside the checkout with global dependency lookup disabled. Earlier Build 33 validation separately recorded 58 scoped upstream jogging tests; that is not a newly rerun Build 37 result.

This documentation update independently verified the APK version/runtime/payload hash, all 21 Build 37 change-manifest hashes, and all 1,261 hybrid-source hashes. It did not rebuild or rerun the runtime suite. A recorded Build 35 machine session sustained regular and XY jogging, but the operator reported XY stutter. Build 36's acceleration simulation improved continuity; that model is not a CNC measurement. Build 37 has not been physically validated by its build process: held-touch recovery, Bluetooth with Location Services off, radio/input cadence, sustained jobs and stopping behavior still need tablet/knob/CNC confirmation.
