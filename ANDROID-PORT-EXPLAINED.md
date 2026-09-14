# Android port: integration notes for gSender maintainers

**Scope:** Android Build 13, `1.7.0-dev-android.13`, on the fork’s `android-port` branch. The current upstream base is `dev` commit `8a4a5dd4506d5901f0c6c395a11fde53be4ebbd9`; the original port used `v1.7.0-Edge-1`. This note describes Android-specific implementation and deviations from upstream.

Build 13 carries the existing USB, pendant fitting, connection-dialog, and P2 knob changes onto that newer base. The integration remains under `android-port/`: upstream application files are adapted during bundling. The repository now includes a Gradle wrapper, checksum-verified runtime download, pinned runtime dependency lockfile, and clean-checkout build instructions.

## Platform replacement

Electron is replaced by a Java Activity/WebView and a foreground service embedding Node.js Mobile **18.20.4** on a dedicated thread. Node and the Java service share an application process; Android manages WebView rendering. No external host or helper process is required.

CMake links a custom JNI library against `libnode.so`. The APK includes `libnode.so`, `libgsender_bridge.so`, and `libc++_shared.so` for `arm64-v8a` and `armeabi-v7a`. Native/build parameters are API 26 minimum, API 35 target/compile, JDK 17, Gradle 8.9, AGP 8.7.3, NDK 27.2.12479018, and CMake 3.22.1. Node's old-space limit is 384 MiB, excluding WebView and native allocations. Hardware validation targets the Lenovo TB-8506F on Android 11. The bundled Node libraries use 4 KiB pages; 16 KiB-page devices are outside the current target.

## USB binding and compatibility contract

`android-port/usb/js/esbuild-plugin.cjs` replaces `serialport` imports with an Android Duplex adapter. Bootstrap installs its transport before requiring the backend bundle. The adapter implements only the API surface currently consumed by the port; it is not a general serialport replacement.

The native boundary is `process._linkedBinding('gsender_usb')`. Requests carry an incrementing `id`, an `op`, and a unique port `session`. Replies resolve/reject requests by ID; unsolicited data and close events carry the session. Binary data uses Base64 inside JSON. Java callbacks enter Node through `uv_async`/event-loop dispatch rather than invoking V8 on USB threads.

`UsbSerialModule.java` owns discovery, permission requests, and serial operations through `usb-serial-for-android 3.9.0`. Port paths are `android-usb:<Android device ID>:<port number>` and must be rediscovered after attachment changes. Session checks discard stale callbacks. Permission handling covers denial, timeout, cancellation, and delayed grant callbacks; fresh enumeration also clears sessions for missing devices.

Important behavioral constraints:

- A write resolves after the driver returns. Partial/failed writes are not retried.
- Physical detach reports `close(error)` with `disconnected=true`. Using `destroy(error)` for detach previously introduced an extra stream error that could terminate the bridge through the bootstrap fatal handler.
- DTR/RTS are initially asserted once, without an intentional reset pulse.
- The JNI queue is bounded to 2 MiB and the JS receive buffer to 1 MiB; overflow fails the connection.
- Flow control and several unused serialport operations remain unsupported. Firmware flashing is rejected before the upstream handler can reset or close the controller.

## Android-only build transforms

All 1,421 files recorded in `android-port/upstream.json` matched their SHA-256 hashes during this Build 13 documentation update. The backend bundle still contains modifications: aliases and checked string/regex transforms apply them during the Android build.

| Integration point | Android delta |
| --- | --- |
| Electron path/log imports | Substitute app-private paths and console logging |
| Home/i18n resolution | Redirect to the extracted runtime and private data directories |
| Server binding | Prevent persisted desktop Remote Mode configuration from overriding loopback |
| HTTP/Socket.IO startup | Install local authentication and UI connection diagnostics |
| Flash handler | Early explicit rejection |
| Frontend bootstrap | Omit telemetry initialization; select the saved pendant preference; set viewport |
| `SerialConnection.write` | Select bounded writes only for `context.usbPendant === true` |
| Top-bar components | Add mount anchors for the Android USB knob launcher |

`android-port/scripts/build-backend.cjs` fails if its checked transform anchors disappear. Vite also checks the connection-widget anchor; some CSS/HTML substitutions are plain replacements and still need output inspection when upstream changes. Upgrades require reviewing these patches rather than relaxing the checks. Packages remain external in esbuild, so new runtime imports must also be added to `android-port/runtime-deps/`.

## Persistence, authentication, and process lifetime

The service extracts the hashed payload to private `files/runtime`; backend data is separate in `files/data`. Payload changes replace runtime files without intentionally clearing saved data. WebView uses the stable origin `http://127.0.0.1:8765` to preserve local storage.

The backend creates a new random token per process. `MainActivity` installs an HttpOnly, SameSite=Strict cookie using `CookieManager.setCookie` and **awaits its callback before navigation**. The initial request also carries `X-gSender-Key`; HTTP and Socket.IO validate the same credential. Bootstrap HTML is non-cacheable, and initial navigation has a launch-specific query.

This ordering is required: an earlier build could display cached UI after restart while the backend rejected its stale cookie. Android continued enumerating USB devices, but no open request reached the native module. Explicit cookie renewal fixed that user-reported failure.

The foreground service holds a CPU wake lock while USB is active. Removing the task from Recents closes USB, releases service resources, and terminates the process, with a 1.5-second fallback if cleanup stalls. Node can be initialized only once per process. Backgrounding alone does not intentionally terminate the CNC backend, but Activity visibility changes disarm the optional knob. App shutdown is not a controller emergency stop.

Android document pickers replace desktop file dialogs. The implemented export bridge limits encoded data to 48 MiB. General Electron-only tools and external shell integrations have not been comprehensively adapted.

## Frontend-specific adjustments

Both frontend bundles are packaged. A small desktop bootstrap script reads `state.workspace.usePendantViewAsDefault` from the existing `sienci` local-storage record and redirects to `/pendant/`. There is no separate Android mode preference or replacement view selector.

WebView density-based sizing made the pendant controls too large on the target tablet. The Android viewport fits 1280 CSS pixels in landscape and 800 in portrait, updates on orientation changes, and disables pinch zoom. Desktop viewport width remains 1280.

## USB knob extension

`android-port/pendant/{service,protocol,controller}.cjs` implements an optional second USB endpoint for ESP32-C6 native USB `303a:1001`. Its routes share the existing localhost authentication layer. It runs inside the embedded backend.

The extension starts disarmed and requires explicit connection/arming, a healthy knob, fresh machine state, idle CNC, empty feeder, and active UI. P2 uses an on-knob STEP value of 0–10 mm in 0.1 mm increments, while retaining gSender’s Precision feedrate. The selected step must be acknowledged by the host before motion is accepted; each detent captures its axis and distance. It accepts finite increments one at a time, checks completion, and rejects stale/duplicate input. Its queue is bounded to eight entries with 200 ms expiry; saturation drops input instead of treating fast rotation as a transport failure. P2 requires matching ESP firmware and rejects older P1/B1 protocols. Reconnection does not re-arm or replay motion.

`writeBounded` and `WriteDeadline.java` impose a 250 ms queue-plus-driver budget on knob-related writes, rejecting expired requests before transmission. Ordinary CNC writes keep their previous path. UI heartbeat and native Activity visibility updates disarm the extension when inactive. These bounds are software controls, not hard real-time guarantees.

Build-time transforms place the launcher beside the board connection widget. The current layout uses an explicit horizontal connection group; its connection/arming iframe is presented in a modal dialog that makes underlying controls inert. These UI adaptations are separate from the knob protocol. ESP firmware is maintained in the separate HID Knob project and is not built into the Android APK.

## Packaging and validation changes

`package-payload.py` replaces the production dependency directory, assembles both frontends/backend/assets, rejects desktop `.node` binaries, and produces the ZIP/hash embedded by Gradle. Preserve the signing key and application ID for in-place updates.

A missing-package failure exposed a test isolation problem: Build 7 omitted `acorn`, but desktop tests resolved it from the parent checkout. The runtime manifest now explicitly includes `acorn` and `acorn-walk`. Integration tests extract the **actual payload ZIP outside the checkout**, copy only the native mock, clear `NODE_PATH`, and disable global module search. They then exercise the real backend through HTTP/Socket.IO.

Protocol details are in [P2-PROTOCOL.md](android-port/pendant/P2-PROTOCOL.md). Build setup is in [android-port/README.md](android-port/README.md). Build-time Node is 22+; the embedded runtime remains 18.20.4, with backend output targeting `node18` and frontend output targeting `chrome87`.

For a clean checkout, install root packages with scripts disabled and runtime packages with the frozen Yarn lockfile, run `scripts/fetch-runtime.py`, configure `local.properties` and a private signing key, then run `./android-port/scripts/build.sh`. Paths here refer to `android-port/`. The downloader verifies the Node archive against `vendor-manifest.json` before extracting it. Runtime binaries, SDK paths, signing keys, payloads, and APKs are ignored by Git.

The build sequence is backend → desktop Vite → pendant Vite → payload ZIP → tests → Gradle assembly/lint → APK verification. Tests use `--test-concurrency=1` because backend fixtures share port 8765; the Java deadline test requires `JAVA_HOME`. Verify APK signing separately. Increment both Gradle version metadata and the backend `BUILD_VERSION` definition for subsequent APKs.

This documentation update verified source provenance and build configuration; it did not rebuild the APK or rerun the runtime suite. The preceding Build 12 integration handoff reported 56 passing Android tests. Earlier tablet testing confirmed SLB control, EEPROM editing, restart recovery, and corrected launch. Those results do not establish Build 13 hardware behavior: knob operation, sustained streaming, timing, layout, and lifecycle under load still require device validation.
