# Build 47 — current UI and SLB-Lite support

Built 2026-09-18 from the current shared UI source and Build 46 performance/backend changes. Includes the saved UI task changes explicitly authorized for this build: larger matching landscape DRO/jog containers, updated segmented presets and header controls, paired feed/spindle sliders, and separate Console and Macros bottom-navigation panels. A production CSS priority conflict in the spindle layout was corrected after checking the first APK on the K90.

Pico-based SLB-Lite (`2e8a:000a`) now uses the same automatic connection and reconnect policy as STM32 SLBs (`0483:5740`). The Android attachment filter includes both. Android's initial permission/default-app choice is still required. ESP knobs, bootloaders and ambiguous multiple-board attachments are excluded from automatic CNC selection. Physical Lite hardware operation has not yet been tested with this APK.

Retains Build 46's bounded worker-rendered toolpath preview, compact job-line storage and RAM-aware memory policy. Uses the existing ARM32 Node 24.21.0 runtime with up to 1,536 MiB V8 old-space; this is not a total application memory cap. No native runtime rebuild was needed.

Validation: 304 regression tests passed, including packaged-backend auto-connect/hotplug/recovery tests for both STM32 and Pico identities; six affected UI checks passed again after the CSS correction. Both frontends, release assemble/lint, APK contents and compatible signature were checked. Installed over USB on K90_ROW (Android 16). Device benchmark results are recorded separately after testing.

## K90 benchmark results

- Complete contour (3,978 commands) and arc (25,898 commands) streams matched their ordered command checksums at about 500 commands/s. No receive-buffer overflow.
- 30 MiB and 40 MiB relief files loaded and streamed through approximately 42-second samples including visualizer panning, then stopped on request. They were not run to completion.
- Running-pan host frame-duration p95 remained 500 ms for arcs and both relief cases, matching Build 46. The interface still misses frame deadlines; this is not a 60 FPS result.
- Sampled combined app/WebView PSS peaked at 558 MiB (arcs), 1,032 MiB (30 MiB relief) and 1,224 MiB (40 MiB relief). No observed crash, preview allocation error or memory-guard stop.
- Tests used an isolated grblHAL TCP simulator via ADB on K90 Android 16. Physical USB/CNC operation, multi-hour runs, 100+ MiB files and low-memory tablets are not qualified by these samples.

Detailed results and raw evidence: workspace `outputs/job-benchmark/k90-build47-20260918/Build47-K90-performance-report.md`. APK: `gSender-Android-build-47.apk`, SHA-256 `99ed3f48702a75e1a3b71f9212d1d0d9412eb89b7b3d6aad8ac2efe1480f3637`. The installed and delivered APKs match byte for byte.
