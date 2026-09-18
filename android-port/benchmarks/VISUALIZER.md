# Visualizer responsiveness during jobs

This extends the existing tablet benchmark with **manual pan/pinch gestures during an isolated simulated job**. It never injects touchscreen coordinates that could accidentally hit machine controls. The new in-app telemetry requires a future build containing these source changes; Build 45 does not have it. No APK has been built for this work.

## What changed in the renderer

The Android adapter for the pinned gviewer SVG renderer batches viewport writes to one per animation frame, skips unchanged viewport writes, excludes the toolpath from SVG hit-testing, and updates the live marker without rewriting the bounds or viewport. It preserves the original projection, path geometry and gesture calculations. The SVG root retains pointer capture and receives gestures. Marker and viewport updates share a frame callback; disposal cancels pending callbacks. There is no change to the pendant layout, job commands or machine movement.

The existing stable-options optimization remains: controller position updates must not trigger a complete toolpath rebuild through React's options prop.

Host regression tests exercise the actual gviewer renderer with 30,000 segments. A batch of 100 pan updates, 50 pinch updates, 10 wheel updates and live position changes produced the same final viewBox and identical path geometry. Viewport writes fell from 183 to 1 for that artificial burst plus subsequent marker updates; bounds writes fell from 23 to 0. This demonstrates less work, **not a measured tablet FPS gain**. Large SVGs still have painting/tessellation costs, which must be measured on the tablet.

## Capture procedure

Use the existing [simulator setup](README.md), with physical CNC hardware disconnected and Tilt jog off. Before loading a fixture, start the app with the optional benchmark flag. This command stops the app first, so use it only at the start of the isolated test:

```sh
adb -s TABLET_SERIAL shell am start -S -W -n com.gsender.android/.MainActivity --ez visualizer_benchmark true
```

The flag adds `benchmark=visualizer` to the local WebView URL. Telemetry is logged locally under `gSenderBench`, without enabling WebView remote debugging. Normal launches do not install the observers or emit gesture logs. A browser-only development test can opt in with `/pendant/?benchmark=visualizer`; its measurements are not an installed-app result.

Start `tablet.py ... record` before performing gestures. Its existing logcat capture includes the gesture records. Use the same memory guards, acknowledgement rate, orientation, visualizer settings and telemetry interval for each comparison. Do not screen-record the primary timing comparison; video capture adds rendering overhead.

For each contour, relief and arcs fixture, starting small and increasing only after stable tests:

1. Load the file, wait for the preview to settle, and perform one unmeasured warm-up gesture.
2. Mark `visualizer-idle-start`. With the job idle, pan left/right for 5 seconds, release; then pinch out/in for 5 seconds and release. Repeat three times. Mark `visualizer-idle-end`.
3. Start the simulated job at 500 acknowledged commands/s. Mark `run-static-start`, leave the view untouched for 15 seconds, then mark `run-static-end`.
4. Mark `visualizer-run-start`. Repeat the same three pan/pinch cycles while streaming, then mark `visualizer-run-end`. Use a fixture long enough for the entire interval; the recorded job state must remain `running`.
5. Repeat the untouched-view window after the gestures to check recovery. Let the full job finish and verify the ordered command checksum. Unload and allow memory to settle.
6. Repeat with the other orientation. Compare like-for-like viewport dimensions; do not change orientation during a gesture capture. Larger jobs and faster acknowledgement rates are separate steps after this baseline passes.

Examples, using the same output directory as the collector/simulator:

```sh
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB visualizer-idle-start
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB visualizer-idle-end
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB run-static-start
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB run-static-end
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB visualizer-run-start
python3 tablet.py --serial TABLET_SERIAL --out results/relief-5MiB mark relief-5MiB visualizer-run-end
python3 report.py results/relief-5MiB
```

Run each marker at the corresponding action, not all commands together. Keep intentional pause/resume/stop tests outside these interaction windows. Stop and investigate a crash, memory guard, sustained freeze, stream interruption or checksum mismatch before increasing workload.

## Metrics and interpretation

- **Event dispatch delay:** delivered pointer-event timestamp to handler start. This detects main-thread queueing where the browser exposes a usable timestamp. It is not the time from physical finger contact.
- **Event to requestAnimationFrame (rAF):** oldest pending delivered input timestamp to the next frame callback. It includes queueing and scheduling but does not prove the GPU presented that update.
- **Frame gaps:** callback interval median, p95 and maximum, plus counts above 34, 50 and 100 ms. These are absolute stall thresholds, not refresh-rate-adjusted dropped-frame counts or presented FPS. Include the release tail; abort measurements on background/blur.
- **Long tasks:** count/time from the browser's Long Tasks API when supported. Unsupported values remain unavailable rather than zero. A task overlapping the gesture start can contribute its complete duration.
- **Stream effect:** simulator progress is sampled once per second. The report compares commands/s and status-poll gaps in complete windows inside each phase. This is separate from full-job checksum verification. A partial run cannot be reported as an integrity pass.
- **Resources:** app-process PSS and CPU are shown per phase when available. Existing WebView candidate memory is separate; it is not silently attributed to gSender. Sampling can miss peaks, and these diagnostics also have overhead.

Each gesture is limited to 60 seconds and each timing series to 8,192 samples. Truncation, cancellation, hidden/background transitions and unsupported APIs are reported explicitly. Percentiles from truncated samples are not full-gesture percentiles. Logs contain timing, job state and viewport dimensions, not file contents or commands. Old captures without gesture telemetry report **NOT MEASURED**, never a zero-lag pass.

Compare repeated runs, particularly running-versus-idle gesture p95/max gaps, and static-versus-interactive stream rates. A smooth average can hide occasional stalls. Do not claim a particular file-size limit or physical-machine reliability from this test.

After the simulated job and capture have ended, a normal launch disables telemetry:

```sh
adb -s TABLET_SERIAL shell am start -S -W -n com.gsender.android/.MainActivity
```

Restore the previous Ethernet settings and remove the simulator tunnel as described in the main benchmark guide.
