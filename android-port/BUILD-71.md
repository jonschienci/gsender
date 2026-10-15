# Build 71 — USB reliability test (ARM64)

Experimental test APK for the L1108. Physical SLB job reliability remains to be verified.

- APK: `gSender-Android-build-71-usb-test-arm64.apk`
- Android version: `1.6.4-android.71-node24-prototype`, version code 71.
- SHA-256: `ec5fe729e7a8628c82c891d6d9d4b11a1f4b665e3cec91e0c2dd9a2ea81bc5a0`.
- ABI: `arm64-v8a` only. This APK is not for the 32-bit Lenovo.
- Signing identity matches prior personal builds; install with `adb install -r` to retain app data.

## Contents

Uses the Build 66 application baseline from the isolated Build 70 comparison source, with passive USB failure diagnostics and the existing stop-on-disconnect safeguard. The 70 compiled frontend files are unchanged from the actual Build 66 APK except the two HTML build-number labels. The Node 24.21.0 and C++ runtime libraries are byte-identical to the verified Build 66 ARM64 compatibility APK; the JNI bridge is rebuilt with USB failure diagnostics and 16 KiB page support.

Includes the changes documented in [the USB investigation](USB-RELIABILITY-2026-10-09.md): usb-serial 3.11.0, 16 queued endpoint-sized reads for SLB and SLB-Lite, immediate rejection of queued writes after reader failure, cancellation of stale reset/override callbacks, and reconnect backoff through briefly successful opens. Interrupted jobs are not automatically restarted. Unused Kotlin and AndroidX annotation dependencies from the Java driver's publication are excluded to preserve compatibility with the project's lint toolchain.

The changes were applied to this isolated baseline without copying unrelated post-66 UI/backend edits. The main checkout retains all its current work and was not reverted.

## Verification

- 48 focused USB/controller/job-disconnect checks passed.
- Both STM32 and Pico packaged-backend connection/reconnection integration tests passed using simulated devices on localhost.
- Release assembly and lint completed successfully. Existing manifest/API/orientation lint warnings remain.
- APK payload checksum, signing identity, architecture, version, ZIP alignment, and unchanged Node/C++ runtime binaries verified.
- Installation and launch results are recorded under `work/build71/l1108-launch/`.

Reproduction source: `work/build71/source/`. Build/runtime provenance, logs, hashes, and frontend comparisons are under `work/build71/`. No physical CNC job was started by the assistant. No commit or push is part of this test release.
