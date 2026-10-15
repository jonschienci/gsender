# Official Android ARM32 test 1

A local compatibility adaptation of official `features/android` commit
`2234816dc3ac0581bfb9421c37229910af38dd6f`, gSender Pendant 1.7.0-Edge-3,
Android version code 14778. Built and installed on Lenovo TB-8506F on 2026-10-06.
This is not an upstream-published ARM32 release.

## Minimal change

The input is the verified official APK from [Actions run 37519540395](https://github.com/Sienci-Labs/gsender/actions/runs/37519540395). Its 60 non-native, non-signature entries are retained byte-for-byte, including the compiled manifest, DEX application code, resources and all gSender payload files. No interface, backend, USB, Kotlin, SDK-level, package-ID or Gradle source change was needed.

Replace only the ARM64 native entries with:

- `armeabi-v7a/libnode.so` and `libc++_shared.so`, taken from the verified personal Build 67 APK. Node remains version 24.21.0; the ARM32 runtime build options are recorded in the included provenance.
- `armeabi-v7a/libnode_exec.so`, a tiny PIE executable compiled for API 29 that calls `node::Start(argc, argv)`. The official NodeService already launches this filename and sets its native-library search path.

Add Node's license and ARM32 build provenance under `assets/arm32-runtime/`, align the APK and re-sign it using the official repository's checked-in debug key. The signing certificate matches the original official APK. This changes its runtime packaging, not the official application code. The upstream version name/code and launcher label **gSender Pendant** remain unchanged; the APK filename identifies **arm32-test-1**.

## Validation

- Original retained-entry SHA-256 values all match the final signed APK.
- All three packaged native files are ELF32 ARM. APK signature and ZIP alignment verify.
- Installed APK hash matches the exported file. Package `org.sienci.gsender.pendant` coexists with personal `com.gsender.android`; neither app's settings are copied to the other.
- Two Lenovo launches passed backend readiness and page-load checks. First install: Ready 5.215 s, page load 8.181 s. Second process launch: Ready 3.695 s, page load 5.310 s. Log output confirms Node v24.21.0. These are startup milestones, not interactive readiness/FPS measurements.
- A later screenshot confirms the actual official interface rendered. The native USB control channel connected to its backend. No physical USB controller, job, SD transfer or performance benchmark was run.
- The unchanged official payload reports a missing plugin SDK and favicon at startup. They do not prevent the tested launch; plugin SDK consumers remain an upstream packaging limitation, not something patched into this adaptation.

The original ARM64 runtime and this ARM32 runtime have different build configurations. This adaptation enables testing the official application code on the same Lenovo and with the same ARM32 Node library as the personal app; it does not establish the behavior or performance of the upstream ARM64 runtime.

## A/B use

Open **gSender Android Build 67** for the personal version or **gSender Pendant** for the official adaptation. Stop the inactive app before using a CNC so both cannot claim USB. The official app's notification has a Stop action; the personal app closes its processes when removed from recent apps. Exit personal kiosk mode with five taps on Build if needed. Both installations and their data remain separate.

The official app was left open after validation, with Build 67 stopped. Use the same file, orientation and controller for comparisons. The personal onboard benchmark mode is not added to the official app.

## Artifact / reproduction evidence

`gSender-Official-1.7.0-Edge-3-2234816dc-arm32-test-1.apk`

- Bytes: 61,257,947.
- SHA-256: `ab407f3cc38f762461ac09800a9c38c762580a8d48d67a0a35c3d39576ce1944`.
- Original official APK SHA-256: `fe7c8119d99d98c265ab8a9cb19c87ff0c55fd43ac9f57b5c5da5a5bcb8f9187`.
- Public debug certificate SHA-256: `406dbd65621df7e6c0aa6e9b1421ceae4c37cc27b08417fcbf31e41d0973758c`.

Local `work/official-arm32-test-1/` contains `launcher.cpp`, `package.py`, native ELF inspection, retained-entry hashes, provenance, signature/verification results, startup logs, device-check script and screenshot. The APK/checksum are in `outputs/`. No official source checkout was modified, and no commit or push was made.

## USB comparison prepared 7 October 2026

Build 70 (isolated pre-merge application baseline) still disconnected within a second on the Lenovo with a direct cable. The official app was opened for the next comparison; personal `com.gsender.android` is temporarily disabled, with data retained, to prevent it launching automatically and claiming USB. The official app launched and its backend/USB control channel connected. Physical USB/job result is pending.

A filtered, rotating Android log is running on the tablet for at most two hours, under `/sdcard/Download/gSender-usb-official-test/`, capped at approximately 8 MiB. Local setup record: `work/build70/lenovo/official-comparison/setup.json`. Collect that directory after the physical test, stop the recorded logger if still running, force-stop the official app and re-enable the personal package. Do not clear either app's data.

### Result and cleanup

The user's connection menu remained empty. Android recorded the port changing to host mode but no new SLB device in its host history. The official app logged no attach, permission or open event. This attempt did not reach a serial connection, so it is not a running-job stability comparison. The official app and logger have been stopped; the personal package is enabled again. The tablet was rebooted for subsequent diagnosis. Local evidence: `work/build70/lenovo/official-comparison/result/`.

### Follow-up: serial failure reproduced

Later on 7 October, after the tablet reboot and SLB reconnection, Android enumerated `0483:5740`. With the personal backend stopped, this official adaptation opened its USB bridge and failed with `USB get_status request failed` after 1.349 s and 131 ms. It did not pass a physical job test.

A separate temporary instrumentation test also found malformed/failed standard USB information reads with neither gSender backend nor the serial library running. A subsequent cold board reconnect, with both apps disabled, failed to enumerate at all. See [Build 70's isolation results](BUILD-70.md#live-usb-isolation-after-reboot--7-october-2026) for scope and limitations. These observations do not establish which USB host, cable/link or controller component is responsible. Both apps are restored and stopped, the temporary test package removed, and capture processes stopped; settings were retained.
