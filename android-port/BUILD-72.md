# Build 72 — paired home-screen switching

2026-10-14. Installed on the K90 alongside a matching official A/B variant. Neither app needs to be disabled or switched from a Mac.

| Home-screen label | Package | Baseline | Android version |
| --- | --- | --- | --- |
| gSender Android Build 72 | `com.gsender.android` | Tested personal Build 66, ARM32 | `1.6.4-android.72-ab-handoff`, code 72 |
| gSender Pendant AB 1 | `org.sienci.gsender.pendant` | Official `features/android` commit `170c750052b65b31cdd0ef0241a860362bd3d784`, ARM64 | `1.7.0-Edge-3-ab.1`, code 14802 |

## Switching

Disconnect the CNC in the current app, return Home, and tap the other app. Its launcher checks the current app's controller state, stops its service and Node processes, waits for exit, then opens the selected app. An active CNC connection blocks switching; an unreadable connection-state response also blocks it. An idle USB knob is released during teardown after the controller list confirms no CNC connection.

Both apps remain enabled with separate settings/data. A remembered Android USB default for the inactive app forwards the attach intent to the selected app instead of opening another backend. Normal Android USB permission rules still apply. No CNC motion or configuration commands are sent by the handoff module.

The provider accepts only the paired package and its pinned signing certificate (or its own UID). The original activity is non-exported; both launcher icons and USB launches pass through the guard. See [handoff integration](ab-handoff/README.md).

## Preserved baseline

This is an isolated A/B shell update, not a merge of the current working checkout. Personal Build 72 retains Build 66's compiled UI, server, native runtime and USB implementation. Only manifest, added handoff DEX, and build-number labels/checksum differ. All 19 other APK entries and all other payload files were compared with the original Build 66 APK.

The official A/B variant retains every original DEX, server/UI asset and native library from the official [successful build](https://github.com/Sienci-Labs/gsender/actions/runs/38631045078). All 149 retained APK entries were compared. Its manifest and added handoff DEX are local modifications, so this is not an unmodified official release. Original signing identities were retained for in-place updates without clearing app data.

## Artifacts

- `gSender-Android-build-72-ab-handoff-arm32.apk` — SHA-256 `cfb631ad0f5c2c1b5b93bb13d12f8f3d94a709b4c768504184d2023b9d3f3cd3`.
- `gSender-Official-1.7.0-Edge-3-build-14802-ab-handoff-arm64.apk` — SHA-256 `ef794824372620c3a9958fd139c571d3366733d3feb992a7f0ba927cefdad9ac`.

Local artifacts, packaging script, provenance, signing/ZIP-alignment reports and device evidence are under the task workspace's `outputs/` and `work/build72-handoff/`. Keystores are not added to the repository.

## Verification and limits

- Both APK signatures, architectures, version labels and 16 KiB ZIP alignment verified; installed APK hashes match the outputs.
- Tapped each real K90 home-screen icon: selected app loaded and the other backend exited. Both home shortcuts are on the second Home page.
- On-device guard tests passed for idle/authenticated state, active controller, rejected HTTP status and malformed response. An active-controller replica kept running while the launcher displayed the disconnect warning.
- An untrusted shell provider call was rejected without stopping the selected app. A synthetic USB attach directed to the inactive app forwarded to the selected app without replacing its backend or starting the inactive service.
- No physical machine commands or jobs were run for these handoff checks. Earlier isolated user tests found both original apps stable on the K90; this supports avoiding concurrent USB ownership but does not establish the cause of every earlier tablet disconnection. Physical A/B job validation remains necessary.

Use the paired variants together. Installing an unmodified official APK later removes its cooperation; the guarded launcher then refuses to switch rather than assume the other backend is stopped. A future ordinary source build must increment the personal version code above 72. The current checkout contains other pending changes and is not the exact Build 72 baseline.
