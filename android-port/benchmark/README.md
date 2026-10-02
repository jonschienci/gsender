# Onboard job benchmark

Open **Tools → Benchmark**. Unload the current file and disconnect the CNC/knob first. Choose **Quick check** (one full 1 MiB arc job) or **Full suite** (all seven fixtures). Keep gSender in the foreground. Each tablet runs independently: no Mac, Wi-Fi, Internet, or physical CNC is needed. Stop is always available. Return to the same screen to export a JSON report through Android's file picker.

The controller simulator runs in an on-device Node worker, listening only on a random loopback TCP port. It exercises the existing gSender loader, parser, sender, socket updates, pendant visualizer, and rendering worker. A shared connection gate rejects physical USB/network opens, including autoconnect, while the session owns that loopback endpoint. Ordinary motion commands and knob/tilt polling are suspended during the simulation. Program event macros are suppressed for this disposable connection; saved machine settings are not changed.

## Workloads

| Fixture | Mode |
| --- | --- |
| 128 KiB contour | Full stream and command verification |
| 1 MiB arcs | Full stream and command verification |
| MAXMAKE mountain relief, 4.77 MiB | Full 298,263-command stream and verification |
| Generated 5, 20, 30 and 40 MiB relief jobs | Full load/preview, then at least 65 seconds of streaming |

The target is 500 acknowledged commands/second, with a 1024-byte controller RX buffer. Complete jobs compare canonical command count and SHA-256 against the fixture manifest. This checks delivery, not CNC physics: the simulator does not model real cutting time, acceleration, cutter load, or USB electrical behavior. A partial job is explicitly logged as partial and never counted as fully verified. Its current viewport exercise may extend the 65-second window.

Every case pans the actual renderer for six seconds and changes the viewport to 2× zoom, with an eight-second dwell for preview rendering, then restores the original view. Exercises run idle and while streaming; the mountain job repeats them approximately every 160 seconds. `viewport` records include applied view boxes, frame-gap percentiles, long tasks, and preview draw/export timings. These are automated rendering measurements, not physical touch-input latency. Exported `measurements` classify each animation as streaming, mixed, or not-streaming against simulator timestamps, so delayed UI polling cannot mislabel post-stream frames. Completion-display delay uses observed Redux workflow transitions.

## Logs and interpretation

Reports live in the app's private `files/data/benchmarks/<session-id>/` directory. `summary.json` is replaced atomically; `events.ndjson` is appended throughout the run. Restarting after a crash marks a previously running session `interrupted`. Malformed trailing log records are reported instead of preventing export. Twelve sessions are retained, with an 8 MiB event cap per session. App data clearing/uninstalling removes these private reports: export anything you want to keep.

- Native samples: tablet model, Android version, system total/available memory, host-app PSS.
- Backend samples: Node RSS/heap/external memory, CPU time and event-loop delay.
- Simulator: acknowledged command rate, checksum, RX overflows, status-poll gaps and completion time.
- Frontend: load/preview readiness, frame gaps, long tasks, viewport changes and time until the completion display catches up.

**Memory scopes overlap:** do not add Node RSS to host-app PSS. Host-app PSS excludes the isolated WebView renderer; system available memory covers the device. These measurements are not equivalent to earlier Mac-driven combined-process PSS measurements. The on-device simulator also consumes tablet CPU/RAM, so use this suite consistently across tablets when comparing them.

The suite stops when available system memory falls below 256 MiB, or when the frontend stops sending heartbeats for 60 seconds. Leaving the app cancels a run; an app/process crash is recovered on next launch. Completion-display delays are logged even if delivery itself passes. A completed suite is not a claim that every responsiveness metric is acceptable.

## Fixture provenance

`fixtures/manifest.json` contains the size, file SHA-256, canonical command SHA-256, source and modifications for each compressed fixture. The generated jobs are produced by `../benchmarks/jobs.py` and match the Build 51 fixtures. They are gzip-compressed with mtime zero and unpacked on demand; generation is excluded from loading measurements.

The mountain file comes from [MAXMAKE's mountain-relief project](https://maxmake.com/blogs/news/cnc-wood-carving-mountain-relief), using its [public project download](https://drive.google.com/file/d/1YjbiAtlFhYHiFlJvBvd1APZItnQ8qvtz/view). It combines roughing and finishing passes for a 100 × 100 mm relief. The simulation version prepends the benchmark marker and comments out two manual M6 tool changes; motion/feed/spindle blocks and tool numbers are preserved. Source hashes and exact modifications are recorded in the manifest. Attribution does not imply endorsement or a separate license grant. These fixtures are for the isolated simulator, not physical machining.

## Focused local real-job benchmark (Build 63)

The local APK includes the captured skull finishing job from the K90. **Tools → Benchmark → Test Actual skull finishing job · 1.34 MiB** runs only that file, including idle/streaming pan and 2× zoom, the complete 63,208-command stream, checksum verification and completion-display timing. The full suite still includes this job when its local manifest is present.

The original is preserved; the simulator copy retains every original byte after a benchmark marker/comment. `scripts/import-job-fixture.cjs` writes the Git-ignored `fixtures/local/` directory. Focused selection accepts only an existing local manifest ID, never a file path. G20/G21 and G90/G91 control simulated positions. Physical CNC connections remain blocked during the test. See [Build 63](../BUILD-63.md) for on-device results and the [job investigation/logging notes](../PENDING-REAL-JOB-DIAGNOSTICS.md) for provenance.
