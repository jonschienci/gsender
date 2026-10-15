# Android Build 67

Build 67 includes the [scoped official Android integration](PENDING-UPSTREAM-INTEGRATION.md) on top of Build 66. It retains the approved custom UI, XY pad, tilt plus Z jogging, knob support, hybrid preview, kiosk controls, native USB/JNI runtime, ARM32 support and passive job logs. Unfinished ARM64 and CI experiments remain separate. No Git commit or push was made.

## Changes and validation

- Pan/pinch/wheel previews use CSS transforms shared by the toolpath and separate live marker, with periodic camera commits to keep hybrid detail refreshing.
- Single-step jogs use finite streamer displacement. Starting a step while a previous jog drains retains outstanding replies and stops the old timer before replacing it.
- Controller close clears workflow state. Loading progress reaches the existing overlay. Pendant SD listings and YModem completion/error handling include the selected upstream fixes.
- 387 Android/USB tests, 10 view-helper tests and 85 controller tests pass. Both frontend bundles, backend compilation, Android release assembly/lint, signatures, payload hashes and native-library verification pass. Browser checks cover both orientations, compact layout, gesture/marker alignment, alarms, file controls and work-origin updates.
- Installed on Lenovo TB-8506F (`HA1P19R6`, Android 11). The installed APK hash matches the exported artifact. Two launches reached backend readiness at 3.668/3.094 seconds and page-load completion at 6.263/5.232 seconds, with no fatal errors detected. The main UI visibly displays Build 67. Existing settings/data were retained.

The launch timings use existing app data/cache, not a clean install. No simulation, physical machine job or sustained FPS benchmark was run for Build 67. Physical SD transfers, motion transitions and comparative performance remain device checks.

## Official comparison app

The unchanged official **gSender Pendant 1.7.0-Edge-3**, Android version code **14778**, is downloaded from successful [official workflow run 37519540395](https://github.com/Sienci-Labs/gsender/actions/runs/37519540395), source `features/android` at `2234816dc3ac0581bfb9421c37229910af38dd6f`. The Actions ZIP SHA-256 matches GitHub's artifact digest and the APK signature verifies.

| App | Package | Architecture / configuration |
| --- | --- | --- |
| Personal Build 67 | `com.gsender.android` | ARM32, optimized release, Node 24.21 JNI host |
| Official gSender Pendant | `org.sienci.gsender.pendant` | ARM64 only, upstream debug APK, separate Node process |

They can coexist with independent settings. The Lenovo exposes only `armeabi-v7a,armeabi`, so the unmodified official ARM64 APK cannot run on it; use the local ARM32 test adaptation for Lenovo comparisons or a compatible K90/K50 for the unchanged upstream binary. A minimal [ARM32 test adaptation](OFFICIAL-ARM32-TEST-1.md) is now installed beside Build 67 on the Lenovo and passes two launches. Its application code and UI are byte-identical to the official APK; only runtime packaging and provenance differ. The original ARM64 APK has not been tested locally.

For A/B tests, use the same tablet, G-code and viewport. Stop the inactive app before opening USB in the other: both apps can otherwise compete for the controller. Leave personal kiosk mode using five taps on Build when needed. The official notification's Stop action stops its backend. Different architectures and build configurations mean this compares the whole apps, not an isolated rendering patch. The official APK does not include the personal onboard benchmark.

## Artifacts

- `gSender-Android-build-67.apk`: 77,239,722 bytes; SHA-256 `4f359edfea5516db2bf2c93e01cb236a5e0e8e318c615131dd93ee5f249ae530`.
- `gSender-Official-1.7.0-Edge-3-2234816dc-arm64.apk`: unchanged official binary; SHA-256 `fe7c8119d99d98c265ab8a9cb19c87ff0c55fd43ac9f57b5c5da5a5bcb8f9187`.

Local APKs, checksum, mapping and backend debug archive are in `outputs/`; source snapshot, verification logs, official provenance and Lenovo startup evidence are in `work/build67/`. Generated APKs, signing keys and the private skull fixture remain outside Git.
