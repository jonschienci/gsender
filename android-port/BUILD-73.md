# Build 73 — selected upstream improvements

2026-10-15. ARM64 build for the L1108, retaining the custom pendant interface and Build 66 USB/jog baseline. Version `1.6.4-android.73-node24-prototype`, code **73**.

## Changes

- Integrated the newer upstream motion planner and Sender timing model. Actual machine settings feed the estimate; typed per-line timing buffers reach the backend instead of being discarded. Cached estimates update when idle machine settings change, without resetting an active execution playhead. The Android chunked job store remains in use and now accepts LF, CRLF and lone-CR files.
- Failed homing no longer reports a successful home. Homing alarms clear that state, and Unlock requires confirmation after a failed home. Safe G0 retracts use the configured homing pull-off where appropriate, preserving the custom Go To actions.
- Probe continuity checks and timers run only while the continuity step is active.
- Added **Wireless files** to the existing **Plugins** tools grid, plus a compact transfer notice beside the visualizer's file area. Receiving is optional and initially off. A six-digit code authorizes browser/desktop-gSender uploads on the local network. Files stream to a disk library with a 200 MiB limit and never load or run automatically. The file listener exposes no CNC commands; the normal API retains its local authentication. Open a received file explicitly on the tablet.
- Recent files use Blob-backed storage with a 64 MiB per-file and 96 MiB total cache budget. Received library files retain disk references instead of duplicating their contents in the browser cache.
- Surfacing and rotary preparation use separate compact 2D preview workers, avoiding replacement of the active job just to show a preview.

The custom XY pad, tilt jog, knob support, haptics, kiosk, job logging, benchmarks and existing layout are retained. No wholesale replacement with the official Android UI or USB implementation was made. New UI placement was explicitly approved by the user.

## Source and artifact

Upstream reference: official `features/android` commit `170c750052b65b31cdd0ef0241a860362bd3d784`, compared with the fetched `master`, `dev` and `android_v2` refs on 2026-10-15. Selected changes were adapted individually.

The APK was built from the task workspace's isolated `work/build73/source`, using the Build 66 source baseline plus Build 72's cooperative A/B launcher. It retains the USB serial 3.9.0 implementation and existing jog transport, excluding the intervening experimental USB/read-queue changes. Node 24.21.0 and libc++ native bytes match the verified Build 66 ARM64 runtime. Native library segment alignment and APK ZIP alignment were checked for 16 KiB compatibility.

The changes were also merged into the development checkout without deleting its other pending experiments. An ordinary build of that checkout consequently includes those pending native/USB changes and does **not** reproduce this isolated artifact. Keep the release provenance with the APK before committing or rebuilding.

- Artifact: `gSender-Android-build-73-arm64.apk` — ARM64 only, Android API 26+.
- Size: 78,346,412 bytes.
- SHA-256: `a50f11b2aee1214e22cb9f37ec8e0d185d87432890dc10be35963f7c0680ef81`.
- Package/signing identity unchanged; installed with app data retained. No APK, signing key, SDK or generated payload is tracked in Git.

## Validation

- Android/backend regressions: **391 passed**. Controller/estimator suites: **67 passed**. Parser tests, including geometry-before-estimate transfer: **11 passed**. Real HTTP receiver tests: **3 passed**, including rejected/oversized transfers and subsequent recovery.
- Browser checks cover Blob reopen/cache eviction, portrait/landscape receiver layout, failed-home unlock confirmation and existing packaged coordinate/hold/run-lock/rotary controls.
- Release compilation, Android lint, payload verification, signing and alignment passed. Lint retains existing warnings.
- Installed on L1108 `PREL110803684`: Android 16, MediaTek MT6789, ARM64, approximately 5.54 GiB RAM, 1200×1920 display, WebView 155.0.8059.43. Three repeated cold launches completed at 2.17–2.22 seconds with the backend ready at 1.27–1.34 seconds.
- A comment-only file was transferred from the Mac to the tablet over LAN HTTP and appeared in the library (HTTP 200); it was never loaded or run. The file was removed afterward and receiving was returned to Off.
- The initial restart test exposed an OS issue: MediaTek DuraSpeed listed `com.gsender.android` as suppressed and Android refused the WebView sandbox service with `process is bad`. Setting `setting.duraspeed.enabled` to `0` restored repeated startup. This reversible device setting is recorded separately; it is not an application or USB fix.

## Renderer decision and limits

The current hybrid 2D renderer was compared on the L1108 with the newer WebGL renderer using the skull fixture (63,178 visible segments) and a synthetic 400,000-segment fixture. Both sustained approximately **56 FPS** in scripted six-second pan/zoom sweeps at 1280×680 CSS pixels, DPR 1.5. Hybrid p95 frame intervals were approximately 18 ms; the densest hybrid trials had maximum intervals around 27 ms versus 18 ms for WebGL. Initial image readiness was verified before measurement.

The FPS difference did not justify replacing the custom renderer and overlays, so the hybrid renderer remains. These are standalone renderer checks, not full-app job throughput or physical gesture-latency measurements. Loading times from this comparison are not comparable because the renderers used different warmup gates. This does not guarantee a steady frame rate for every job/tablet.

No CNC motion or physical USB job was run during this build's verification. Machine homing, probing, timing accuracy and long physical USB jobs still require user validation; this build does not establish a fix for every earlier disconnection.
