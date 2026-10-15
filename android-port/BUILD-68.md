# Android Build 68 — STM32 USB compatibility test

Build 68 is a targeted connection test based on the frozen Build 67 release. The UI, backend, jog behavior, runtime and other USB drivers are unchanged. No commit or push was made.

## Evidence and change

On the Lenovo TB-8506F (Android 11), the STM32 SLB (`0483:5740`) opened at 09:47:02 on October 7, then the native reader reported `EIO USB get_status request failed`. After reconnecting it ran for 88.5 seconds before the same error. Android still enumerated the same attachment; the final detach occurred later. The official comparison app was stopped throughout this test, so app contention did not explain the reproduced failure.

The pinned usb-serial-for-android 3.9.0 [default read path](https://github.com/mik3y/usb-serial-for-android/blob/v3.9.0/usbSerialForAndroid/src/main/java/com/hoho/android/usbserial/driver/CommonUsbSerialPort.java) probes GET_STATUS after a zero-byte asynchronous completion. Build 68 uses the existing finite bulk-read path with a 1000 ms idle timeout for this STM32 identity only. Empty packets no longer trigger that probe. Reads retain the endpoint-sized buffer and return when data arrives; the timeout is not a polling delay. Genuine transfer failures, writes, detach handling and automatic reconnect retain their existing behavior. Pico SLB-Lite, knobs and other USB devices keep their previous asynchronous reader.

Native error diagnostics now include the connection duration, received-byte count, last receive age, and selected read mode. No command bytes or user job content are added to these diagnostics.

## Validation and limits

- 48 focused USB, reconnect, backend and regression tests pass, with no skips.
- The actual pinned driver JAR, with simulated Android USB responses, reproduces the old GET_STATUS failure. The candidate preserves all bytes through 500 full-packet/empty-packet/short-packet sequences, tolerates ordinary idle timeout, and still rejects failed reads/writes and closed ports.
- Android release assembly and lint, APK signing, payload hashing and ARM32 Node 24.21.0 checks pass.
- All 651 non-label files in the packaged application payload are byte-identical to Build 67. Only the two HTML build labels and benchmark build metadata changed.
- **Follow-up hardware test failed during a real job.** On October 7, `relief-20480KiB.nc` (20,971,529 bytes / 640,458 lines) disconnected 3.606 seconds after Start: 556 lines sent, 525 acknowledged, 31 pending. The native reader again reported `USB get_status request failed`, with data received 5 ms earlier. There was no preceding CNC alarm/error or low-memory indication. Android removed the device about 7.8 seconds later. Build 68 does **not** resolve the disconnect.
- Original release validation: hardware connection stability was **unverified**. The logs establish the failing driver operation, not the underlying electrical/firmware trigger. This change is a compatibility candidate; it does not establish that the cable, firmware or tablet USB stack is fault-free. No real machine motion or job was run during validation.

## Artifact

- `gSender-Android-build-68.apk` — 77239998 bytes.
- Version: `1.6.4-android.68-node24-prototype`; version code 68; `armeabi-v7a`.
- SHA-256: `ce26ad21b4b2bbf20a7425e482b93bbdc3435ec16c932753a830a3030cebd4de`.
- Same package and signing key as prior personal builds; install with `adb install -r` to preserve data.

Local test evidence and source snapshot are in `work/build68/`; the before-change capture is in `work/build67/usb-disconnect/retest-oct07/`. APKs, native runtime binaries and private job fixtures remain outside Git.
