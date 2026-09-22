# Build 51 graphics benchmark — Lenovo TB-8506F

21 September 2026. Android 11, approximately 1,813 MiB usable RAM, 1280 × 800 landscape. Baseline: Build 47 tested earlier the same day.

## Changes tested

- Direct ImageBitmap transfer replaces PNG encoding and decoding for the toolpath preview. The canvas display stays within the existing SVG coordinate system; overlays and controls retain the Build 47 layout.
- Reuse cached toolpath images during panning whenever coverage and resolution remain sufficient; zooming, resizing or exposing uncached geometry requests a redraw.
- Reuse two bounded worker canvases across viewport changes, with the same 1,600-pixel maximum edge and bounded native paths. Superseded images are released; unsupported bitmap presentation falls back to PNG.
- Dense path drawing stays in the worker’s software renderer. The preceding Build 48 experiment allowed GPU path drawing and triggered an input-dispatch ANR while panning the 1 MiB arc fixture. That experiment was rejected. Its evidence is in the adjacent lenovo-build48-20260921 folder.
- Backend, serial streaming, Node runtime, memory policy and unrelated UI work remain at the Build 47 baseline.

## Outcome

Build 51 completed all six simulation samples without an observed crash, ANR, process restart or benchmark memory-limit abort. The two small jobs finished with exact ordered-command checksum matches and no receive-buffer overflows. The four relief jobs were partial streaming samples, not full completed jobs.

All six maintained approximately 500 commands/s while panning. Each fixture required only one completed raster image; cached images covered the subsequent tested pans. This reduces unnecessary drawing and PNG conversion work, but running-pan JavaScript frame-gap p95 remained approximately 116.6 ms, essentially unchanged from Build 47. Input-dispatch timing did not consistently improve. These changes do not establish a user-visible smoothness improvement.

The 40 MiB sample peaked at 835.9 MiB combined app/WebView PSS versus 895.9 MiB in Build 47. Available system memory reached 321.7 MiB, versus 380.3 MiB previously; lower app PSS therefore did not mean more available system RAM in this run. Across workloads, memory was broadly similar. No claim of a statistically established memory reduction is made.

## Results

| Job | Scope | Commands/s | Combined peak PSS MiB: 47 → 51 | Running-pan frame-gap p95 ms: 47 → 51 | Input-dispatch p95 ms: 47 → 51 |
|---|---|---:|---:|---:|---:|
| arcs-1024KiB.nc | Complete, checksum verified | 500.0 | 469.4 → 489.9 | 116.6 → 116.6 | 33.0 → 45.3 |
| contour-128KiB.nc | Complete, checksum verified | 499.9 | 325.4 → 340.5 | — → 116.6 | — → 32.5 |
| relief-5120KiB.nc | Partial streaming sample | 500.0 | 413.6 → 434.1 | 116.6 → 116.6 | 36.6 → 34.2 |
| relief-20480KiB.nc | Partial streaming sample | 500.0 | 650.4 → 627.8 | 116.6 → 116.6 | 32.5 → 34.2 |
| relief-30720KiB.nc | Partial streaming sample | 500.1 | 797.2 → 772.9 | 116.6 → 116.7 | 36.2 → 48.5 |
| relief-40960KiB.nc | Partial streaming sample | 500.0 | 895.9 → 835.9 | 116.6 → 116.6 | 33.4 → 37.8 |

Frame-gap and input-delay columns are medians of per-gesture 95th percentiles from in-app JavaScript telemetry. They are not presented FPS or full finger-to-pixel latency. The contour is short and has only two running-pan gestures; larger cases use eight. Combined PSS sums simultaneous app-process and detected WebView-renderer samples, sampled every three seconds. It does not measure all GPU memory or every transient peak.

## Preview rendering

| Job | Presentation modes | Completed redraws | Cache hits | Median draw ms | Median transfer/export ms | Maximum transfer/export ms |
|---|---|---:|---:|---:|---:|---:|
| arcs-1024KiB.nc | software-bitmap | 1 | 9 | 6789.9 | 3.8 | 3.8 |
| contour-128KiB.nc | software-bitmap | 1 | 2 | 129.7 | 4.1 | 4.1 |
| relief-5120KiB.nc | software-bitmap | 1 | 9 | 1235.4 | 5.4 | 5.4 |
| relief-20480KiB.nc | software-bitmap | 1 | 9 | 5087.3 | 4.9 | 4.9 |
| relief-30720KiB.nc | software-bitmap | 1 | 9 | 6908.7 | 3.9 | 3.9 |
| relief-40960KiB.nc | software-bitmap | 1 | 9 | 8780.6 | 3.8 | 3.8 |

Preview timings are measured within the worker. They exclude main-thread presentation, image upload and time spent on superseded renders. Build 47 did not record these stages separately, so they do not establish a measured percentage speedup over PNG.

## Unresolved progress and stop-display delay

After stopping the 20 MiB sample, the simulator acknowledged cancellation at epoch 1790014417.288241, after 24,296 commands. The UI continued to display Running long enough for the suite to time out while waiting to proceed. A later inspection, 155.1 seconds after simulator cancellation, showed Idle and Line 0; the exact time of the UI transition was not instrumented. The 30 and 40 MiB cases resumed without restarting the app. Every measured case used app PID 10867 and WebView PID 10917.

This is a real unresolved display/state-delivery finding, not a passing responsiveness result. The simulator had stopped; the visible status did not promptly reflect it. Progress counters also trailed received commands during running screenshots, consistent with the earlier Build 47 observation. Its cause is not established by these graphics tests.

## Validation and recovery

309 regression tests passed, including bitmap cleanup, superseded requests, canvas reuse, cache invalidation and compatibility fallback. Both production frontends, Android release assemble/lint and installed APK identity verification passed. Application and pendant UI source plus jog-layout.css match Build 47; UI work from other tasks was not imported.

After testing, the synthetic job was unloaded, Ethernet settings were restored to 192.168.5.1:23, normal rotation settings were restored, ADB reverse was removed and all simulator/collector processes were stopped. Build 51 was relaunched normally without benchmark logging. The final screenshot confirms Disconnected and No file loaded.

Only the Lenovo was tested with Build 51. No current-build K90 comparison or physical CNC/USB test was performed. The normal WebView display remains hardware accelerated; the rejected GPU experiment concerned dense toolpath rasterization, not disabling Android hardware acceleration.

APK: gSender-Android-build-51.apk, versionCode 51, versionName 1.6.4-android.51-node24-prototype. SHA-256: efd556b290593429e054d6bf83ef41da8eb6be83981ecb604814f330ed3266cb.

## Method and limits

The installed APK streams to a loopback-only grblHAL simulator on the Mac via ADB reverse, with 500 acknowledgements/s and a 1,024-byte receive buffer. No physical CNC is moved. The arc and contour fixtures run to completion and verify their exact ordered command checksums; large relief fixtures run through static and pan windows, then stop. This is not a multi-hour or physical USB-serial qualification.

The same eight alternating 1.2-second swipes are injected at x256↔512, y339. Two static windows surround the running pan. This run waits for an explicit completed-preview event before starting interaction; the earlier Build 47 readiness check could precede the initial raster image. Observed load-ready times include file-picker and automation delays and are not parser benchmarks.

Benchmark guards stop on app PSS above 1,024 MiB or available system memory below 256 MiB. Progression to a larger file also requires 350 MiB available. These are benchmark guards, not new app memory limits.

The final run tested arcs before contour; Build 47 used the reverse order. Larger files use the same progression in one app session. Build 47’s 20 MiB streaming window was longer because of an automation interruption. Each comparison is one run, so small timing/memory differences should not be treated as statistically established improvements.

Build 47 previously showed delayed progress counters. This renderer change does not modify progress accounting or telemetry delivery, and improved graphics timing alone would not establish that the progress issue is fixed.

Repository result summary: `build51-lenovo-results.json`. Full raw evidence is retained locally under the build workspace in `outputs/job-benchmark/lenovo-build51-20260921/`: results.json, phases.jsonl, samples.jsonl, simulator.jsonl, benchmark-events.txt, screenshots and frame statistics in each fixture folder, apk-verification.json, test-configuration.json and cleanup.json.
