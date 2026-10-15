# Android Build 70 — pre-merge USB comparison

Temporary diagnostic artifact for the Lenovo TB-8506F (Android 11, ARM32). It uses the Build 66 application baseline to test the reported regression after the Build 67 integration. Build 66 is a comparison baseline, not a proven stable release for this physical job. Main-branch application work has not been reverted.

## Evidence and scope

Build 69 disconnected twice while running `relief-20480KiB.nc`, after 8.534 and 13.102 seconds. Both failures arose in the USB read path without a preceding CNC alarm, low-memory signal or major backend event-loop stall. Details are in [Build 69](BUILD-69.md).

The actual Build 66–69 APKs contain identical ARM32 Node 24.21.0 and C++ runtime binaries. The USB transport and native host source did not change between 66 and 67. This rules out a newly replaced Node binary in that interval, but does not establish the cause or rule out a runtime/platform interaction.

Build 70 restores Build 66 application code and asynchronous USB read mode for all devices. It retains Build 69's bounded failure snapshots, passive job-disconnect logging and the stop-on-disconnect safeguard. It does not replay unacknowledged commands or resume a failed job.

The packaged frontend comes from the actual Build 66 APK. Its files are unchanged apart from build labels. Of the full payload, 650 files are identical; the only changed files are `app/index.html`, `pendant/index.html`, `benchmark/build.json` and `server.cjs`. The backend differences are the build label, passive failure recording and stop safeguard. This is a temporary regression comparison; it does not remove newer functionality from the development branch.

## Validation and use

44 focused USB, reconnect, job-recording and autoconnect tests pass, as does the native read-only probe test. Release compilation, Android lint, APK payload/runtime validation and signature verification pass. Install preserves the existing app data.

Installed on Lenovo `HA1P19R6`; installed APK hash matches, the backend starts and the interface renders Build 70 without fatal startup errors. The official comparison app remains stopped.

**Hardware result: failed on 7 October 2026.** The user confirmed one direct cable and could not maintain a connection for two seconds, so no job could start. Logs show read failures 16, 829 and 127 ms after opening. The device remained listed with permission; post-failure GET_STATUS succeeded and GET_CONFIGURATION returned errno 75. Original transfer status is still unavailable. Evidence: `work/build70/lenovo/job-disconnect/`.

The later application integration is not required to reproduce this failure. This comparison does not rule out changes before Build 66 or identify a hardware/firmware cause.

The installed [official ARM32 adaptation](OFFICIAL-ARM32-TEST-1.md) is prepared for an independent bridge/backend comparison on the same tablet. During the comparison, personal `com.gsender.android` was temporarily disabled (data retained) so it could not claim USB. Both packages have since been restored and stopped. Stop the inactive app before opening the other. No source rollback or new APK was made in response to this result.

## Artifact and reproduction

- Version: `1.6.4-android.70-node24-prototype`; version code 70; ARM32.
- APK: `gSender-Android-build-70.apk`, 77240542 bytes.
- SHA-256: `3cb96bc45ab61e50500e1192efc7bf71b81341082726db36295cd878e8eec139`.
- Baseline APK SHA-256: `bccd1194177b9ef0e3af8f50cc5edd05076e7ca49e159c39c8c74776f628f7bc`.
- Local source snapshot: `work/build70/source`; provenance: `work/build70/comparison-provenance.json`; payload comparison: `work/build70/payload-comparison.json`; test/build logs and `release.json` are alongside them.
- The normal development checkout remains on the latest implementation with Build 69 configuration. Do not label its ordinary output Build 70: reproduce this comparison from the isolated snapshot and its recorded overlays.

No commit or push was made.

## Official comparison outcome

The official app listed no USB device. Android's host-device history was unchanged from the preceding Build 70 attempt; it recorded no new SLB enumeration during the official trial, although the USB port entered host mode at 11:31:53. The app logged no USB attach, permission or open event. This is an enumeration failure, not evidence that the official serial bridge passed or failed a running job.

Both apps' data are preserved. The official app and bounded logger were stopped, personal `com.gsender.android` re-enabled, and the idle Lenovo rebooted (prior uptime approximately 15.8 days) to clear possible USB host state. Evidence is in `work/build70/lenovo/official-comparison/result/`. Root cause remains unconfirmed.

## Live USB isolation after reboot — 7 October 2026

The first official attempt above did not enumerate. A later attempt, observed over authenticated Wi-Fi ADB with the Lenovo directly connected to the powered SLB, did enumerate `0483:5740`. The two apps were tested separately, never with both backends running.

- **Personal Build 70:** repeated USB read failures immediately after opening; some received data before failure. No job was started by the diagnostic tools.
- **Official ARM32 test 1:** USB bridge opened, then the same `USB get_status request failed` error occurred after 1.349 s and 131 ms. This comparison now reproduces a serial failure in the official application code as well.
- **Direct Android USB API:** a temporary instrumentation test, with both gSender backends stopped, made only standard device-information control reads. It did not use Node, the serial library, interface claiming or serial writes. Some GET_STATUS / GET_CONFIGURATION requests failed; GET_DEVICE_DESCRIPTOR sometimes returned the single byte `01` rather than the expected 18-byte descriptor. Repeated identical requests sometimes recovered valid replies. This resembles stale responses, but the cause is not established.
- **Cold board test:** with both application packages disabled during reattachment, the user removed USB and board power for 15 seconds, powered the board and reconnected. Android entered host mode but listed no attached SLB; sysfs contained only the root hub. Therefore no control-read or serial test could run on the cold device.

These failures can occur without the gSender UI/backend or serial library running. That narrows the investigation to USB host/link/device behavior for these attempts; it does not identify a defective component, prove a controller firmware bug or rule out an interaction triggered during an earlier connection. The original bulk-transfer completion status remains unavailable. No failed-job recovery, command replay, error suppression or new application APK was introduced.

Evidence: `work/build70/usb-probe/evidence.json`, direct-query outputs and cold USB snapshots alongside it; `work/build70/lenovo/live-usb/final-logs/android.log`. The temporary instrumentation package was removed, both normal apps restored, and bounded capture processes stopped. App data and controller settings were preserved. Temporary authenticated Wi-Fi ADB was returned to USB mode after the user canceled the Mac comparison.

### Tablet-only follow-up

The same SLB serial number enumerated on the Mac using the comparison cable, but the user disconnected it before direct control queries ran. Further Mac testing was canceled at the user's request; this is detection evidence only, not a stability pass.

Read-only Lenovo checks show `TB-8506F_S000027_210630_ROW`, security patch `2021-06-05`, and kernel `4.19.127-g7c0f5fa-dirty` built on 30 June 2021. Battery saver is off, gSender is already exempt from battery optimization, and Android was awake. The USB host controller power state was read while connected to the Mac in peripheral mode; its suspended state then must not be treated as the cause of the SLB failures. No root-only power settings or controller firmware were changed. The Lenovo system updater reports "You have the latest system version" for this build. No newer OTA or verified USB fix was offered.
