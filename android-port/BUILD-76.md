# Build 76 — keep active STM32 USB streams open across empty reads

2026-10-15. Version `1.6.4-android.76-node24-prototype`, ARM64, Android API 26+. Source tag: `android-build-76` on `android-node24-prototype`.

Build 75 failed during the user's physical skull finishing job on the L1108. The saved report records 34.463 seconds of running, 662 `ok` acknowledgements, no controller errors or alarms, and a valid incoming reply 42 ms before transport closure. Android logged the device detaching 27.889 seconds after the first failure. No low-memory condition was recorded. Evidence is retained in `work/usb-reliability-20261015-build75-job/`.

The immediate close came from three failed `GET_STATUS` control requests following an empty asynchronous USB read. Retrying that probe alone did not solve job reliability. The underlying reason those device-control requests fail remains unverified.

## Change

- For STM32 SLBs (`0483:5740`), an empty read no longer triggers a health probe while serial data has arrived within the last three seconds. CDC zero-length completions can occur between real data packets.
- During sustained silence, the existing bounded read-only health checks still run, at most once per second. Persistent failures still close the transport. A 1 ms yield prevents an immediate empty-read loop from consuming a CPU core.
- Physical detach handling, closed-handle rejection, and upstream write/partial-write failures remain fatal. No machine command is replayed and jobs are not restarted automatically.
- USB data transfers remain in the pinned 3.9.0 driver. Node 24.21.0 and the Build 75 UI/backend source are preserved. Pico SLBs and other USB drivers are unchanged.

## Validation and limits

The new regression reproduces an empty read 42 ms after received data, followed by continued acknowledgements and empty reads; rejected device-control probes must not be issued during that traffic. It also covers quiet-stream failure, probe rate limits, closed/replaced connections and interruption. Existing transport tests cover partial writes, no resend, detach and stale sessions.

- **390 Android/backend regressions passed**, including 22 USB transport checks. Release compilation, lint, payload, signing and native-library verification passed.
- Installed APK SHA-256 was verified on both **L1108 and K90**. Both launched successfully. Initial page-load times, including payload replacement, were 4.469 seconds and 7.430 seconds respectively; these are startup checks, not interaction-latency measurements.
- The user reported **no connection issues** in the latest L1108 job attempt. The passive USB capture shows a continuous 164.009-second attachment and at least 294 tolerated empty reads, with no health-probe closures. The final close coincided with Android detecting a physical port disconnect, consistent with unplugging after the test.
- The user did not specify complete-job duration or completion, so this does not establish long-job reliability on every tablet. No CNC job was started during the K90 installation check.

The public [build manifest](releases/build-76.json) records the APK and runtime hashes. The APK is `gSender-Android-build-76-arm64.apk` (78,352,360 bytes), SHA-256 `a360dded68dbb3fa14c72ad500fbe498f8e60d3d1e42f2b739bb98f6a9108508`.

## Reproduction

The release commit/tag contains the tested application source from `work/build76/source`, rather than the shared checkout's unshipped USB 3.11.0/native experiments or later UI work. It also retains the existing Android-only CI/release filters and adds documentation/provenance; those metadata changes do not alter the installed APK. Earlier Build 73–75 notes describe the isolated snapshots used at the time.

Use a clean checkout of `android-build-76` and a matching externally built ARM64 Node 24.21.0 runtime. The runtime library's checksum and original build recipe are recorded in the manifest. With dependencies, JDK 17, SDK 35, NDK 27.2.12479018 and CMake 3.22.1 available:

```sh
node android-port/scripts/build-backend.cjs
node node_modules/vite/bin/vite.js build --config android-port/vite.config.mjs --configLoader native
GSENDER_ANDROID_UI=pendant node node_modules/vite/bin/vite.js build --config android-port/vite.config.mjs --configLoader native
python3 android-port/scripts/package-payload.py
node --test --test-concurrency=1 android-port/test/*.test.cjs android-port/usb/test/*.test.cjs
./android-port/gradlew -p android-port assembleRelease lintRelease \
  -PnodeRuntimeRoot=/absolute/path/to/node-runtime -PnodeRuntimeAbis=arm64-v8a
python3 android-port/scripts/verify-apk.py \
  --apk android-port/app/build/outputs/apk/release/app-release.apk \
  --abi arm64-v8a --runtime-version 24.21.0
```

Provide the existing local signing key for in-place updates. Private machining fixtures used locally for benchmarks, generated payloads, APKs, SDKs and signing keys are not tracked in Git. A clean build without those private fixture bytes can reproduce the application changes but is not expected to have the identical APK checksum.
