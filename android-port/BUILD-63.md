# Android Build 63

Build 63 fixes the long-filename/control overlap, work-origin updates and missing alarm detail reported on Build 62, and restores the upstream pendant-only geometry optimization that the Android worker previously ignored.

- Loaded/running filenames scroll inside a bounded area, reserving room for file/editor/job buttons. Short landscape layouts no longer push job controls under navigation.
- Zeroing or changing WCS moves the origin correctly while retaining zoom and physical-machine placement. Alarm details open above the visualizer; dismissing details never unlocks the controller.
- Identical position/status reports and unchanged grid/label attributes no longer cause redundant updates.
- Pendant workers emit compact 2D groups, deduplicate repeated XY depth passes and omit pure-Z preview segments/unused 3D buffers. Exact endpoint checking retains close visible detail. 3D, secondary and laser paths retain their existing behavior. Motion, job statistics and Z-height metadata are unchanged.
- The full-screen benchmark dialog is kept on screen instead of inheriting the centered popup translation.
- Tools → Benchmark can test the saved local skull finishing job individually, with complete-stream verification and idle/streaming pan and 2× zoom.

The renderer/runtime dependencies and previous kiosk, USB, jogging and job-logging behavior remain as in Build 62. Separate runtime experiments and design-only preview scripts are excluded. Detailed upstream provenance and Mac worker measurements (including the initial parsing tradeoff) are in [the visualizer investigation](PENDING-VISUALIZER-FIXES.md).

## Release validation

- 379 Android/USB regression tests and 23 controller tests passed.
- Both frontend bundles, backend/payload packaging, Android release assembly and lint, and APK integrity checks passed.
- Packaged UI checks passed at portrait, landscape and short-landscape sizes for control separation, ticker behavior, alarm lifecycle, coordinate changes, wheels and numeric editors.
- APK: `gSender-Android-build-63.apk`, 83,748,318 bytes, version `1.6.4-android.63-node24-prototype`, ARMv7 / Node 24.21.0.
- SHA-256: `484b2a352512853d8fdb0986257f779a1adedd9f2faf0be634c82143b2020dd2`.

## K90 skull simulation

Installed on K90_ROW (Rebecco, Android 16), preserving app data. Installed APK SHA-256 matched the exported APK; Build 63 launched successfully. The onboard portrait viewport was 800×1333 CSS pixels, DPR 1.5875; Android reported 8,192 MiB RAM.

The saved 1.34 MiB skull finishing job completed in a 168.0-second benchmark session:

| Measurement | Result |
| --- | ---: |
| File/preview ready | 2.014 s |
| Full stream | 63,208 commands, 126.412 s |
| Acknowledgment rate | 500.01 commands/s (target 500) |
| Canonical command checksum | Matched |
| Receive-buffer overflows / preview errors | 0 / 0 |
| Completion shown after stream ended | 540 ms |
| Minimum sampled available memory | 5,700.2 MiB |
| Peak sampled host-app PSS | 496.1 MiB |
| Maximum backend event-loop delay | 81.1 ms |
| Maximum heartbeat request time | 59 ms |

One idle and five fully streaming pan/2×-zoom exercises were captured. A sixth exercise labeled `stream:5` actually occurred after completion and is classified as **not streaming** in the report; it is excluded from streaming ranges below.

- Idle frame gaps: median 16.7 ms, p95 33.4 ms, maximum 250.2 ms.
- Streaming frame gaps: medians 16.7–33.4 ms, p95 116.7–133.5 ms, maxima 266.7–300.1 ms.
- No low-memory sample or preview error was recorded. The final app log had no matching fatal exception, ANR, out-of-memory or `gSender stopped` message.

**Result:** complete command delivery passed; rendering still has substantial intermittent stalls during streaming. This run does not establish an FPS improvement against Build 62, because there is no matching controlled skull benchmark for that build. Additional work should target rendering/update behavior; increasing the memory budget is not supported by this run's available-memory readings.

The test used the on-device loopback simulator, including its CPU/RAM overhead. It did not move a physical machine or validate USB electrical behavior. Host-app PSS excludes the isolated WebView renderer and overlaps Node RSS; do not sum them. Automated viewport timings are not finger-input latency.

Report session: `6b14f070-0de1-4390-acf3-cef4d0a0b8f4`. The exported report and summarized measurements are preserved with local build artifacts as `outputs/job-benchmark/build63-k90-skull/report.json` and `summary.json`; the source G-code remains in the Git-ignored local fixture directory. The build is not committed or pushed.
