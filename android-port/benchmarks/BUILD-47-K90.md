# Build 47 — K90 job and visualizer benchmarks

18 September 2026. Tested the final installed Build 47 APK with the newly authorized UI changes, Pico SLB-Lite auto-connect support, and retained Build 46 performance improvements. The installed and delivered APK hashes match (`apk-verification.json`).

| Workload | Stream result | Peak app / combined PSS | Running-pan p95 | Build 46 p95 |
| --- | --- | ---: | ---: | ---: |
| contour-128KiB.nc | 3,978 commands; checksum matched | 348 / 521 MiB | Not measured | Not measured |
| arcs-1024KiB.nc | 25,898 commands; checksum matched | 361 / 558 MiB | 500 ms | 500 ms |
| relief-30720KiB.nc | Partial sample, 499.7 commands/s while panning | 497 / 1032 MiB | 500 ms | 500 ms |
| relief-40960KiB.nc | Partial sample, 499.8 commands/s while panning | 616 / 1224 MiB | 500 ms | 500 ms |

No spontaneous app crash, backend failure, Vulkan allocation error, raster-preview error, receive-buffer overflow or memory-guard stop was observed in these samples. The app PID remained 8265.

The full contour and arc runs achieved 500.16 and 499.69 commands/s respectively. Both ordered SHA-256 checks matched the fixture. The 30 and 40 MiB relief jobs were deliberately stopped after about 42 seconds of streaming each; they were not run to completion.

## Comparison with Build 46

Running-pan Android frame-duration p95 remained 500 ms for the arc, 30 MiB and 40 MiB cases. Combined PSS was approximately 558 / 1,032 / 1,224 MiB, versus 584 / 1,037 / 1,215 MiB in Build 46. These short samples show no material regression in the measured streaming and rendering metrics. They do not establish statistical equivalence: the new UI changes the visualizer viewport, and warm-process history, garbage collection and telemetry sampling affect the memory peaks.

The visualizer still misses frame deadlines. Android host frame duration is not presented FPS or physical finger-to-display latency. Opt-in JavaScript telemetry observed no >50 ms long tasks during the recorded running-pan gestures. Median per-gesture rAF gap p95 remained about 167 ms. Automated swipes can merge into fewer telemetry gestures, so gesture count is not the number of injected swipes.

## Configuration and limits

- K90_ROW, Android 16, landscape 2000×1200; portrait was checked visually, not performance-benchmarked.
- Real installed release app, Node 24.21.0 ARM32, existing RAM-aware policy and 1,536 MiB V8 old-space ceiling.
- Loopback grblHAL simulator through ADB, 500 acknowledgements/s and 1,024-byte receive buffer. No physical CNC was connected. USB serial transport, SLB-Lite hardware operation and multi-hour endurance remain untested by this run.
- 128 KiB contour and 1 MiB arcs completed; 30/40 MiB relief cases are short load/run/pan/stop samples. They do not qualify arbitrary 40 MiB jobs, establish the maximum supported size, or test 100+ MiB files or a 1.5 GiB-memory tablet.
- Memory is sampled every three seconds. Combined PSS sums the app and recorded WebView candidate process; Android can have other WebView users, and sampled peaks can miss transients. System available memory stayed above 4703 MiB.
- Guard thresholds: app PSS 1,536 MiB and system available memory 768 MiB; neither was reached.

## Build and UI checks

304 regression tests passed, including packaged backend connection/recovery tests for STM32 and Pico identities. Release assemble/lint, payload contents, runtime ABI and signature checks passed. A production CSS precedence conflict in the new spindle/feed panel was fixed before benchmarking; six affected UI checks passed again. The final APK launched, retained user settings and showed the updated portrait and landscape layouts.

The first arc-picker attempt stopped in the test harness because the preceding file was still loaded; the preparation step was corrected before the arc case started. Another preparation check encountered the completion modal obscuring the connection label; the modal was dismissed before verification and the large-file runs. These were harness-navigation issues, not app crashes or failed streams.

Raw evidence: `results.json`, `samples.jsonl`, `phases.jsonl`, `simulator.jsonl`, `logcat.txt`, per-case `*-gfx.json`, screenshots and fixture sidecars. The contour screenshot named `contour-loading.png` was captured after completion and shows its successful Job End dialog. Final restoration is recorded in `cleanup.json`.

Cleanup completed: unloaded the synthetic job, disconnected/stopped the simulator, stopped the collector intentionally (`stop_reason: interrupted`), removed the ADB reverse tunnel, restored Ethernet to `192.168.5.1:23` and automatic rotation, then relaunched Build 47 normally with benchmark telemetry disabled. All 268 memory samples were valid, with zero telemetry errors. The normal Carve screen is visible.

Machine-readable case metrics are in [build47-k90-results.json](build47-k90-results.json). Raw device logs and screenshots are retained with the build workspace and are not part of this repository report.
