# gSender Android

Android host for gSender's existing desktop and pendant interfaces, Node backend, and direct USB serial connection to a CNC controller. The Android-specific code lives in this directory; upstream source is adapted only at bundle time.

## Target and status

Initial hardware target: Lenovo TB-8506F (Android 11) with a Sienci SLB through USB OTG. The application supports arm64-v8a and armeabi-v7a, minimum Android 26. Machine control, EEPROM editing, and reconnect across app restarts have been confirmed on earlier development builds. This branch ports that work onto upstream `dev`; it is a development build, not a validated production machine-control release. Current provenance is recorded in `upstream.json`.

## Upstream Node prototype

The `android-node24-prototype` branch can build against upstream Node 24.21.0 while preserving the existing backend and USB bridge. Builds 18–20 use that runtime for the Lenovo’s 32-bit Android system. Follow [the runtime build instructions](node-lts/README.md); the default legacy build instructions below still select Node.js Mobile unless `nodeRuntimeRoot` is provided. This is an Android runtime prototype with explicit maintenance and hardware-validation requirements.

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

Output: `android-port/app/build/outputs/apk/debug/app-debug.apk`.

```sh
adb install -r android-port/app/build/outputs/apk/debug/app-debug.apk
```

Keep the signing key private and preserve it for updates. An APK signed with another key cannot update an existing installation in place. No APKs, signing keys, SDK files, downloaded runtimes, or generated payloads are tracked.

## Use

Starting with Build 20, unplug and reconnect the SLB after installation, choose **gSender Android** in Android's USB dialog, and enable its **Always** / **Use by default** choice. Android still requires this initial approval; the app cannot grant itself USB permission. Once gSender is the default handler, subsequent attachments can connect without another permission request. The existing activity is reused when Android delivers an attachment, preserving the WebView and backend. A board already attached when gSender starts also connects if Android has granted access. Automatic selection requires exactly one device with the SLB's STM32 CDC identity (`0483:5740`, first serial interface), an authenticated UI connection, and no active or pending board connection. Other serial controllers still use gSender's connection selector.

Unexpected disconnects reconnect automatically, including transport failures where the USB device remains attached at the same address. Failed opens back off from 2 to 30 seconds. Selecting Disconnect keeps that attachment disconnected until it is unplugged and replugged; manual Connect remains available. Automatic attempts never request Android permission: they wait for an existing grant and resume when it becomes available. If the default has been cleared or access is missing, replug and choose gSender again, or select manual Connect to request access. A denied or abandoned manual permission prompt is respected until replug or another manual Connect. Autoconnect uses the existing gSender controller initialization and does not issue jog, homing, unlock, or job-start commands or automatically resume an interrupted job. The pendant connection button follows the shared connection state, including automatic connections and interface reloads.

In Config > Basics > UI Options, enable **Use pendant view as default UI**, then swipe-close and reopen to switch interfaces. Both interfaces use the same local backend. Pendant scaling fits landscape and portrait without pinch zoom.

The USB knob button sits to the right of the board connection. Its connection/arming dialog blocks underlying UI interaction while open. The optional ESP32-C6 knob integration starts disarmed and requires explicit connection and arming with a compatible P2 firmware (see `pendant/P2-PROTOCOL.md`). It uses the validated P2 step selection and saved Precision feed rate in mm, one bounded finite increment at a time, rejects stale/duplicate events, and does not reconnect or re-arm automatically. Ordinary SLB serial traffic keeps the upstream serial interface.

Swiping the app out of Recents stops USB and the embedded backend process. Backgrounding with Home preserves the service but disarms the knob. Closing the app is not a machine emergency stop.

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
