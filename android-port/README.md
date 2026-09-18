# gSender Android

Android host for gSender's existing desktop and pendant interfaces, Node backend, and direct USB serial connection to a CNC controller. The Android-specific code lives in this directory; upstream source is adapted only at bundle time.

Current build: [Build 47](BUILD-47.md), including the authorized UI update, Pico SLB-Lite automatic connection, and retained Build 46 job-performance changes.

## Target and status

Initial hardware target: Lenovo TB-8506F (Android 11) with a Sienci SLB through USB OTG. The application supports arm64-v8a and armeabi-v7a, minimum Android 26. Machine control, EEPROM editing, and reconnect across app restarts have been confirmed on earlier development builds. This branch ports that work onto upstream `dev`; it is a development build, not a validated production machine-control release. Current provenance is recorded in `upstream.json`.

## Upstream Node prototype

The `android-node24-prototype` branch can build against upstream Node 24.21.0 while preserving the existing backend and USB bridge. Builds 18–24 use that runtime for the Lenovo’s 32-bit Android system. Follow [the runtime build instructions](node-lts/README.md); the default legacy build instructions below still select Node.js Mobile unless `nodeRuntimeRoot` is provided. This is an Android runtime prototype with explicit maintenance and hardware-validation requirements.

## Build requirements

- Node.js 22+, Yarn 1.22.22, Python 3.10+, JDK 17 (`JAVA_HOME` set).
- Android SDK platform 35 and build-tools 35.0.0, NDK 27.2.12479018, CMake 3.22.1.
- Gradle 8.9 wrapper is included.

From the repository root:

```sh
yarn install --ignore-scripts
yarn --cwd android-port/runtime-deps install --frozen-lockfile --ignore-scripts
python3 android-port/scripts/fetch-runtime.py
```

Create `android-port/local.properties` containing `sdk.dir=/absolute/path/to/android-sdk`. Downloaded Node.js Mobile libraries are checksum-verified using `vendor-manifest.json` and stored in the ignored `vendor/` folder. Create your own local development signing key:

```sh
keytool -genkeypair -keystore android-port/debug.keystore -storepass android -keypass android \
  -alias androiddebugkey -dname 'CN=Android Debug,O=Android,C=US' \
  -keyalg RSA -keysize 2048 -validity 10000
./android-port/scripts/build.sh
```

Starting with Build 22, the build script produces an optimized, non-debuggable release APK: `android-port/app/build/outputs/apk/release/app-release.apk`. It uses the existing local signing key so it can update earlier builds. `assembleDebug` remains available for debugging.

```sh
adb install -r android-port/app/build/outputs/apk/release/app-release.apk
```

Keep the signing key private and preserve it for updates. An APK signed with another key cannot update an existing installation in place. No APKs, signing keys, SDK files, downloaded runtimes, or generated payloads are tracked.

For each new distributed build, increment the version code and version strings and name the APK `gSender-Android-build-N.apk`. The installed app name automatically includes the version code, for example **gSender Android Build 23**, so the tablet identifies the installed build.

## Use

Starting with Build 20, unplug and reconnect the SLB after installation, choose **gSender Android** in Android's USB dialog, and enable its **Always** / **Use by default** choice. Android still requires this initial approval; the app cannot grant itself USB permission. Once gSender is the default handler, subsequent attachments can connect without another permission request. The existing activity is reused when Android delivers an attachment, preserving the WebView and backend. A board already attached when gSender starts also connects if Android has granted access. Automatic selection requires exactly one supported SLB-family USB candidate on its first serial interface, an authenticated UI connection, and no active or pending board connection. Build 47 recognizes STM32 CDC (`0483:5740`) and Pico CDC (`2e8a:000a`) for SLB-Lite, and registers both in Android's USB attachment filter. These IDs identify CDC firmware families, not a unique board model, so the normal GrblHAL initialization still applies. Other USB identities use gSender's connection selector.

Unexpected disconnects reconnect automatically, including transport failures where the USB device remains attached at the same address. Failed opens back off from 2 to 30 seconds. Selecting Disconnect keeps that attachment disconnected until it is unplugged and replugged; manual Connect remains available. Automatic attempts never request Android permission: they wait for an existing grant and resume when it becomes available. If the default has been cleared or access is missing, replug and choose gSender again, or select manual Connect to request access. A denied or abandoned manual permission prompt is respected until replug or another manual Connect. Autoconnect uses the existing gSender controller initialization and does not issue jog, homing, unlock, or job-start commands or automatically resume an interrupted job. The pendant connection button follows the shared connection state, including automatic connections and interface reloads.

In Config > Basics > UI Options, enable **Use pendant view as default UI**, then swipe-close and reopen to switch interfaces. Both interfaces use the same local backend. Pendant scaling fits landscape and portrait without pinch zoom.

The USB knob button sits to the right of the board connection. Its connection/arming dialog blocks underlying UI interaction while open. The optional ESP32-C6 knob integration starts disarmed and requires explicit connection and arming with compatible P2 firmware (see `pendant/P2-PROTOCOL.md`). Exact STEP remains the default: validated P2 step selection and saved Precision feed rate in mm, one bounded finite increment at a time. Build 24's **Adaptive: Precision → Rapid** option keeps slow exact steps at Precision and ramps sustained fast turns toward the saved Rapid feed, capped by the axis maximum. It uses the same adaptive-capable firmware as Build 23. Both modes reject stale/duplicate events and do not reconnect or re-arm automatically. See [current operation and limits](pendant/RAPID.md), or the [Build 23 fallback behavior](pendant/ADAPTIVE.md). Ordinary SLB serial traffic keeps the upstream serial interface.

Swiping the app out of Recents stops USB and the embedded backend process. Backgrounding with Home preserves the service but disarms the knob. Closing the app is not a machine emergency stop.

## Backend memory

Build 21 raises the embedded Node V8 old-generation heap ceiling from 384 to 768 MiB. This is a growth limit, not a preallocated block or a limit on total application memory. Native buffers, Java, and the WebView consume additional memory. The Lenovo reports approximately 1.77 GiB usable RAM and runs 32-bit Android, so the budget leaves room for those other uses instead of exhausting its memory/address space.

A G-code file can expand to several times its disk size during parsing and visualization. This change provides more headroom; it does not establish that every 100+ MB job fits. The test-only `test/native-memory-probe.cjs` uses the isolated Java JNI harness and APK libraries to check the actual heap limit and retain 512 MiB of JavaScript arrays while exercising the bridge. On the Lenovo, the Build 21 APK libraries reported an 816 MiB total V8 heap limit (768 MiB old generation plus other heap spaces), retained 514 MiB of heap data, and passed the JNI echo at 550 MiB process RSS. All 66 regression tests, Gradle assemble/lint, and APK verification also passed. The isolated memory test excludes the WebView and does not open a USB device or stream a job.

## Build 22 performance

- Keep the pendant SVG visualizer options stable between renders. Position updates now update the marker without rebuilding every toolpath. The geometry and position-update logic are preserved.
- Reuse parsed line totals for progress. When metadata is unavailable, count nonblank lines in 32 KiB chunks using posted tasks, avoiding a full temporary line array and yielding between chunks. Cancel obsolete work when the file changes.
- Load the USB knob panel on first opening and pause its status polling while hidden. The 400 ms arming heartbeat and motion protocol are unchanged.
- Skip formatting disabled backend logs and suppress verbose Electron-shim logging. Warnings, errors, and informational messages remain available.
- Enable Android release optimization and resource shrinking, with explicit keep rules for JNI, WebView JavaScript methods, and reflected USB driver constructors. The Node runtime and 768 MiB old-generation heap budget are unchanged.

All 70 regression tests, both frontend builds, Gradle release assemble/lint, and APK verification passed. The APK is 66.1 MiB, compared with 69.9 MiB for Build 21, and uses the same signing certificate.

| Check | Before | Build 22 | Scope |
| --- | --- | --- | --- |
| 30 position updates with 30,000 SVG segments | 30 full toolpath rebuilds | 0 full toolpath rebuilds | Real gviewer component/renderer in Mac Node 24 with JSDOM; not a tablet frame-rate measurement |
| Count lines in a 20 MiB synthetic job | 799 ms blocking computation | 447 ms computation across 640 chunks; longest measured chunk 5.57 ms | Isolated Node 24 on Lenovo; excludes browser scheduling and full job parsing |

The optimized APK classes were checked on the Lenovo using `test/release/ReleaseProbe.java`: all seven serial drivers retained their reflection entry points, the `jogPress` and `save` WebView bridges remained available, and JNI names were preserved. The actual release native libraries also passed the isolated JNI/memory probe (816 MiB total V8 limit, 514 MiB heap used, 620 MiB process RSS). These probes do not launch the full interface or open a controller; they do not establish end-to-end streaming or large-job performance.

Performance regression tests run in the normal test suite. The optional line-count benchmark is:

```sh
node android-port/test/line-count-benchmark.cjs "$PWD/android-port/ui/line-count.mjs"
```

When packaging the upstream Node runtime, use `assembleRelease lintRelease` with the runtime properties from the Node instructions, then pass `--apk android-port/app/build/outputs/apk/release/app-release.apk` to `scripts/verify-apk.py` alongside the runtime version and ABI options. Retain `app/build/outputs/mapping/release/mapping.txt` with each distributed APK to decode optimized Java stack traces.

## Architecture

- `app/`: Java Activity, foreground service, JNI bridge and selected embedded Node runtime.
- `usb/`: USB Host transport and serialport-compatible Node adapter; finite knob commands have a 250 ms queue/driver deadline.
- `runtime/`: private storage paths, Electron shims, authenticated loopback bootstrap.
- `pendant/`: optional USB knob protocol/controller/service and connection panel.
- `scripts/`: scoped bundle transforms, both frontend builds, runtime/payload and APK verification.
- `runtime-deps/`: pinned backend packages and lockfile.
- `test/` and `usb/test/`: USB, knob, lifecycle, startup preference, and isolated packaged-backend regressions.

The backend binds only to 127.0.0.1:8765. Each app launch refreshes a session cookie before loading the WebView. HTTP and Socket.IO requests are authenticated. Upstream remote binding settings do not expose this backend to the LAN. No external USB helper is needed.

## Verification and limitations

Run tests with `JAVA_HOME` set and `--test-concurrency=1` because backend tests share a loopback port. The build script performs those tests, Gradle assemble/lint, and APK checks. Backend integration tests extract the shipped payload outside the checkout and disable global module search, preventing development dependencies from masking missing APK packages.

Build 20 passed 66 tests, Gradle assemble/lint, and APK verification. Regressions cover the rendered pendant connection button, same-address USB recovery, retry backoff, silent permission waiting, manual disconnect, knob exclusion, and absence of motion commands during connection. The APK backend also passed startup, hotplug, same-address failure/recovery and silent permission-wait simulations on the Lenovo under Node 24.21.0. Physical SLB reconnection and Android's remembered default choice still require validation with the board attached.

Firmware flashing is disabled. Desktop-only shell/Electron features are not generally ported. Node.js Mobile 18.20.4 uses 4 KiB-page libraries; 16 KiB-page devices are outside this target. Sustained CNC jobs, hardware knob integration, tablet layout and background behavior require physical validation. Simulator tests do not establish machine safety or reliable timing on actual hardware.

## Build 25 Wi-Fi knob candidate

See [Wi-Fi fallback](pendant/WIFI.md) for pairing, the disarmed link test, timing rules, validation, and hardware limitations. The CNC remains directly connected by USB.

## Build 28 automatic Wi-Fi pairing and recovery

Scan the knob QR to pair and connect automatically. Temporary Wi-Fi loss pauses jogging and can restore a previously armed setting after fresh neutral-input and CNC checks. Manual pairing and diagnostics are in Advanced. See [operation, firmware requirements, and limits](pendant/RECONNECT.md).

## Build 29: QR-only pairing controls

Removed manual pairing JSON, IPv4 override, Test Wi-Fi link, Use pairing and Forget pairing from the panel. Scan selects Wi-Fi and connects automatically. Visible UI heartbeats remain live when jog presets are missing/invalid or display units are inches, so those settings cannot suppress Wi-Fi reconnection. Motion still requires valid presets and explicit arming; invalid settings revoke retained arming. See [connection behavior](pendant/RECONNECT.md).

## Pending next build: header build number

Android desktop and pendant headers replace the gSender logo with a compact
`Build N` label. Packaging reads `versionCode` from `app/build.gradle` and writes
it into both HTML entries before React loads, including when frontend assets
are reused. The pendant hold-to-quit gesture stays on the same header element.
The first release with this change must compile both UI variants with
`android-port/vite.config.mjs`; subsequent payload-only releases automatically
refresh the number. This source change does not increment or rebuild Build 29.

## Pending next build: concise CNC knob dialog

QR scanning and pairing status appear only when Wi-Fi is selected, and start
hidden for USB. Removed static explanatory paragraphs, mode instructions, and
inline help from the dialog. Connection, arming, mode controls, live status,
reconnection diagnostics, and errors remain. Source only; no new APK generated.

## Pending next build: selectable tablet XY touch pad

Normal and pendant jog panels gain a persistent **XY controls** selector. The
XY touch pad blends finger distance from the center into 0–Rapid feed, with
board axis limits, bounded motion, and release/background cancellation. Existing
Z/rotary controls remain. See [tablet XY pad](pendant/TABLET-XY-PAD.md). Compile
both frontend variants and backend in the next release; no new APK was made.

## Build 30: Bluetooth knob and tablet XY pad

Includes the pending tablet XY selector above in both interfaces. USB remains
the default knob connection; Bluetooth replaces Wi-Fi in the regular selector.
Scanning the matching **PAIR BT QR** pairs and connects automatically. Transient
loss reconnects and retains the armed setting subject to fresh neutral/CNC/UI
checks; authentication failures revoke it. Android pairing is process-memory-only.
See [Bluetooth protocol, operation and validation](pendant/BLE.md).

## Build 31: XY pad readiness and switch

Fixes the XY pad's persistent “Waiting for idle CNC” state caused by testing the
USB queue after enqueueing its own status request. Both interfaces now use a
**Jog buttons / XY pad** switch. See [tablet pad operation](pendant/TABLET-XY-PAD.md).

## Build 32: responsive knob input and automatic readiness

The new compact firmware protocol replaces Bluetooth status bursts with one
bounded input snapshot. Adaptive mode responds to fast turns without a backlog.
Connect or scan the QR, release controls briefly, and readiness is automatic;
Arm/Disarm buttons are removed. Reconnection requires fresh input and CNC checks,
with no motion replay. Requires matching INPUT-v1 knob firmware. See
[operation, protocol and validation](pendant/INPUT.md). Build 31's XY-pad fix
and Jog buttons / XY pad switch are preserved.

## Build 33: stable core, dev jogging and pendant

See [Build 33 release notes](BUILD-33.md) for source pins, reconnect behavior and validation.

## Build 34: tablet XY pad handover

See [Build 34 release notes](BUILD-34.md) for the automatic-knob handover fix and validation.

## Build 35: jog touch handling and XY position rounding

See [Build 35 release notes](BUILD-35.md) for the touch cancellation, motor-resolution handling and persistent error message changes.

## Build 36: smoother tablet XY jogging

See [Build 36 release notes](BUILD-36.md) for acceleration-aware XY buffering, queue limits and validation. Regular jog controls remain unchanged from Build 35.

## Build 37: touch recovery and Bluetooth without location access

See [Build 37 release notes](BUILD-37.md) for XY touch recovery, direct QR-based Bluetooth connection and validation.

## Build 38: circular pad with Precise rim steps

See [Build 38 release notes](BUILD-38.md) for single-step rim taps, preserved center dragging and larger square pendant jog controls.

## Build 39: tablet pendant layout

See [Build 39 release notes](BUILD-39.md) for the landscape/portrait arrangement, spaced jog controls, DRO selectors, collapsible Status strip and bottom navigation tray toggle.

## Build 40: header fit and CNC knob tray

See [Build 40 release notes](BUILD-40.md) for the compact header, landscape DRO overflow fix, adaptive wider jog layout and CNC knob tab beside Console.

## Build 41: tilt jogging and jog card refinement

See [Build 41 release notes](BUILD-41.md) for sensor-based Tilt jog with flat neutral and selected preset speed, the narrower jog card, left-side A-axis buttons in landscape, and removal of the XY speed readout.

## Build 42: lock orientation during Tilt jog

See [Build 42 release notes](BUILD-42.md) for the temporary screen rotation lock that preserves the current perspective while Tilt jog is enabled.

## Build 43: tilt compatibility, Z handover and startup recovery

See [Build 43 release notes](BUILD-43.md) for independent sensor sampling, live speed-preset changes, Z jogging while tilt remains enabled, interrupted controller initialization recovery and the wider portrait DRO.

## Build 44: simultaneous tilt and Z, compact readiness light

See [Build 44 release notes](BUILD-44.md) for combined X/Y/Z jogging, Z operation during flat calibration, and the small green/amber/grey indicator in the jog container.

## Build 45: tilt direction display and taller control tray

See [Build 45 release notes](BUILD-45.md) for automatic XY-pad tilt feedback, a 6-degree dead zone and 40-degree full-speed angle, and the expanded tray aligned directly beneath the connection/status bar.
