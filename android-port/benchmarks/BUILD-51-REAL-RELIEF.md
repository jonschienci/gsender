# Build 51 — real mountain relief benchmark

Lenovo TB-8506F, Android 11, 1280 × 800 landscape. 21 September 2026. Existing Build 51 APK; no application code or layout changes made for this test.

## Public job and why it is representative

[MAXMAKE’s mountain relief project](https://maxmake.com/blogs/news/cnc-wood-carving-mountain-relief) publishes the original Vectric project and CNC toolpaths. The selected file is `snow‑capped mountain.nc`, downloaded through the article’s [public archive](https://drive.google.com/file/d/1YjbiAtlFhYHiFlJvBvd1APZItnQ8qvtz/view).

The original file contains 298,262 non-comment commands in 5,005,274 bytes (4.77 MiB). It includes two tool operations, roughing and finishing, dense short line segments, varying Z depths and modal coordinates. X/Y span −50 to +50 mm and programmed Z spans −23.378 to +10 mm. The median G1 segment is approximately 0.315 mm; the linear cutting path totals approximately 280.0 metres. No geometry was tiled, duplicated or rescaled to inflate the job. This is a complex real toolpath, but its approximately 4.77 MiB size does not retest the earlier 40 MiB memory threshold.

For unattended simulation, the test copy replaces the two M6/M06 tool-change words with comments and prepends the existing simulator marker G4P0.123. All original motion blocks, feeds, spindle commands and tool numbers remain unchanged. The test copy contains 298,263 commands. Original and test-copy SHA-256 hashes and the exact changes are recorded in the fixture metadata. It is a simulator fixture, not a machine-qualified machining file.

## Method

The installed app sends the complete file to the Mac’s loopback-only grblHAL simulator through ADB reverse. The simulator acknowledges 500 commands/s with a 1,024-byte receive buffer; it never connects to a physical CNC. This accelerates the sender workload and does not model physical cutter acceleration, cutting forces or actual elapsed carving time. A real controller would consume these roughing and finishing blocks at varying rates according to feed, distance and acceleration; sustained 500 commands/s is a stress condition, not a measured typical cutting rate.

Eight alternating 1.2-second pans are injected before starting, then around the beginning, 180, 360 and 520 seconds of the stream. Memory is sampled every three seconds, with app and sole WebView renderer recorded separately. The controller verifies ordered canonical command count and SHA-256 at program end. The UI is then observed independently for its completion state.

## Full-job result

**Streaming passed the full-file integrity check, but display responsiveness remains an unresolved failure.** The app streamed the real job without an observed crash, ANR, process restart or memory-guard abort. The UI still showed Running about 56 seconds after controller completion; Job End was observed at 60.35 seconds. That delay must not be interpreted as successful real-time status display.

- Controller completion: **298,263 commands in 596.53 seconds**, 500.00 commands/s.
- Ordered command checksum match: **True**. Receive-buffer overflows: **0**.
- Combined app/WebView peak PSS: **401.4 MiB**. App process peak: 236.7 MiB. Minimum available system memory: 754.9 MiB.
- Measured app PID(s): ['28585']; WebView PID(s): ['28618']; memory samples: 212.
- Matching crash/renderer-error log lines in the measured window: 0.
- Observed file selection to load-ready: 14.3 s; to completed preview observation: 14.4 s. These include picker/automation latency and are not isolated parser timings.

## Interaction while streaming

| Window | Pans | JS frame-gap p95* ms | Input-dispatch p95* ms | Median commands/s | Lowest complete one-second interval |
|---|---:|---:|---:|---:|---:|
| visualizer-idle | 8 | 33.3 | 31.3 | — | — |
| visualizer-run | 8 | 116.7 | 34.1 | 500.0 | 499.1 |
| visualizer-run-middle | 8 | 116.7 | 33.7 | 499.9 | 499.2 |
| visualizer-run-late | 8 | 116.7 | 33.7 | 500.0 | 499.3 |
| visualizer-run-final | 8 | 116.7 | 33.8 | 499.9 | 499.4 |

*Medians of each gesture’s p95. JavaScript frame gaps are not presented FPS, and event-dispatch delay is not complete finger-to-pixel latency. Native Android frame statistics are retained separately.

Preview completed-image events: 1; cached-image reuse events: 12. The rendering stages are recorded in results.json.

## Completion display

In the finishing-pass screenshot, gSender displayed line 164,402 and 55%, while a simulator sample within 0.02 seconds of the saved image had acknowledged 188,504 commands (about 63%). UI line counts include a few comment/blank blocks, but that small difference cannot explain this gap. This confirms substantial progress-display lag during the real-world job. The exact one-way event latency cannot be inferred from a screenshot.

A screenshot taken 0.97 seconds after controller completion still showed Running, 86%, and line 257,363. The controller had already acknowledged all 298,263 commands. The last Running observation was at approximately 56 seconds; Job End was first observed at 60.35 seconds. The final dialog reported COMPLETE, 00:09:56, Errors: None.
UI completion observed: **True**. The last observation was 60.35 seconds after the simulator finished. Polling delay is included; this is an observed upper bound when completion is detected, not an exact latency.

## Limits and evidence

After testing, the simulated file was unloaded, the original Ethernet endpoint and rotation settings were restored, and the simulator, collectors and ADB reverse connection were stopped. Build 51 was relaunched normally, without benchmark logging.

One run on the Lenovo, without a physical controller. This verifies a real published toolpath as a sender workload, not machining correctness, USB reliability, a full physical-duration endurance run, or K90 behavior. PSS sampling can miss transient peaks and does not count all GPU memory. Benchmark guards are 1,024 MiB app PSS or less than 256 MiB available system memory; they do not change app memory policy.

Compact results are in `build51-real-relief-results.json`. Full evidence remains locally in the build workspace under `outputs/job-benchmark/lenovo-build51-real-relief-20260921/`: source-analysis.json, fixture metadata, results.json, phases.jsonl, simulator.jsonl, benchmark-events.txt, samples.jsonl/CSV, completion-ui-observations.json, screenshots and per-window Android frame statistics. The downloaded files remain local; no third-party files were pushed to Git.
