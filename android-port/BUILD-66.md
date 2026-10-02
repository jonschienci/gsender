# Android Build 66

Build 66 combines the approved October 2 UI with the prepared parser, pan and touch-response fixes. It keeps the existing Node 24.21.0 JNI backend, USB transport, controller logic, kiosk operation and job logs. No commit or push was made.

## What changed

- Latest UI: reordered Probing/Prep/Tools/Console and bottom navigation; inline manual tool-change controls and Exit; ATC settings and tool configuration in the viewport; tool chapters above progress; larger rotary dial and revised position marker; explicit axis action labels; hold-to-home/zero viewport controls; compact Close File icon and disconnected connection hint. Only one interactive tool timeline is mounted. Existing running-job restrictions and touch/hold behavior remain.
- Scoped upstream `dev` parser allocation reductions, bounded invalid-line samples and safe reconnect reuse. The compact Android 2D geometry format remains. A separate live-marker SVG prevents position updates from repainting the whole toolpath. Ordinary buttons use `touch-action: manipulation`; jog/hold gestures retain their existing handling.
- Backend JavaScript dependencies are bundled, preserving native adapters, required assets and license notices. Source maps and bundle metadata are exported separately for debugging. The payload has 654 entries instead of a loose 6,100-file dependency tree. Compressed payload: 48.30 MiB; whole APK: 73.66 MiB versus Build 65's 80.11 MiB. This is a disk/package reduction, not a claimed RAM reduction.
- Node compile caching is enabled before backend loading and flushed after readiness. Unavailable caching does not prevent startup. RAM-aware heap limits are unchanged.
- A checksum-verified staging directory is extracted before replacing the active payload, with previous-payload recovery and no replacement of user settings/logs. Installer tests cover bad checksums, invalid ZIP paths, missing files and interrupted activation. Startup status includes bounded payload/backend/page diagnostics. Recovery does not automatically resume a machine job.

These are selected ideas from upstream `features/android`, not a wholesale branch or architecture migration. The runtime remains ARMv7; ARM64, 16 KB native runtime validation and emulator CI remain separate work.

## K90 quick performance check

Installed app, Android 16, 1200 × 2000 panel, 800 × 1333 CSS viewport. The onboard loopback simulator ran the saved 1.34 MiB skull finishing fixture, including all 63,208 commands, six-second pan sequences, 2× zoom and dwell periods. No physical CNC was connected or operated.

| Measurement | Build 66 K90 result |
|---|---:|
| End-to-end file/preview ready | 1.686 s |
| Verified streaming | 63,208 / 63,208 commands; matching hash; zero overflows |
| Streaming rate / duration | 500.02 commands/s / 126.41 s |
| Complete check | 167.52 s; completed successfully |
| Pan/zoom/dwell frame rate, idle window | 52.8 fps |
| Pan/zoom/dwell frame rate, six streaming windows | 39.4–51.7 fps |
| Frame gap, median in each window | 16.7–16.8 ms |
| Frame gap, 95th percentile in each window | 33.4 ms |
| Longest sampled frame gap | 133.4 ms |
| Host app + Node PSS range | 286.6–505.2 MiB |
| Lowest available system memory | 5,379.9 MiB |
| Highest sampled backend JS heap used | 44.9 MiB |

No low-memory report, backend error or Android fatal exception was observed in this check. The app completed the simulated job and returned to idle. Visual screenshots retained the toolpath during and after pan/zoom exercises.

The frame rates include zoom dwell and idle portions; they are **not continuous-pan-only rates or physical finger latency**. Occasional 100–133 ms gaps remain, so this does not establish a steady 30 fps floor. Host PSS excludes the isolated WebView renderer; available system memory covers the whole device. This is a single short fixture, not an arbitrary-large-file or real-machining guarantee. The original Chrome before/after figures are kept separately in [the parser/pan investigation](PENDING-PARSER-UI-PERFORMANCE.md) and are not relabeled as APK results.

## Startup and validation

K90 repeated process launches reached backend readiness in about 2.03 s and page-load completion in 3.64 s with normal WebView creation. The deferred-WebView experiment reached the backend in about 1.70 s but page-load completion was still 3.64–3.66 s, so the production default remains unchanged. These are repeated launches with existing app data/cache, not clean-install or interactive-readiness timings. The first recorded normal launch also cleaned up the retained previous payload and took 4.66 s.

386 Android/USB tests and 23 controller tests passed. The final targeted payload/backend-cache/SVG regression rerun passed, as did release assembly, Android lint and APK verification. Packaged Chrome checks covered coordinate tap/hold/keypad operations, running locks, rotary controls, wheel states, tool-change containment, timeline expansion, filename/origin/alarm behavior, real preparation forms and position-driven tracking. K90 update preserved app data; the installed APK hash matched the exported artifact and repeated launches reached the main UI.

`android-port/scripts/android-launch-check.py` automates selected-device install/hash and startup checks, writing timings, logs and a screenshot. A fresh-install device test, emulator CI, Lenovo/K50 comparison and real-machine test were not performed for Build 66.

## Artifact and local evidence

`gSender-Android-build-66.apk`; version `1.6.4-android.66-node24-prototype`; ARMv7, Node 24.21.0. Install with `adb -s SERIAL install -r gSender-Android-build-66.apk` to preserve data.

APK bytes: **77238350**. SHA-256: `bccd1194177b9ef0e3af8f50cc5edd05076e7ca49e159c39c8c74776f628f7bc`.

Local validation artifacts are under `work/build66`: `k90-skull-benchmark.json`, `k90-performance-summary.json`, startup folders, packaged UI check reports and logs. APK, backend debug maps, native mapping and checksum are in `outputs/`. The user's skull G-code remains a local fixture and is not added to Git. Source and this documentation are ready for the user's review and commit; signing keys, generated payloads and APKs remain outside Git.
