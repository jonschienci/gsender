# Tablet job performance benchmark

These tools test the **installed gSender APK**. They do not compile, install, or alter the app, and they do not incorporate pending UI changes. Record the installed version with every run. Python 3.9+ and Android platform-tools are the only host requirements.

Validated on the existing K50 Build 45 installation: see [pilot results](PILOT-2026-09-18.md).

## What this measures

1. **Load/visualize:** use the app's real Android file picker; record from selecting a file until its preview and controls respond.
2. **Job streaming:** the real tablet backend sends the job to a loopback GRBL simulator on the Mac through an ADB reverse tunnel. It acknowledges at a controlled rate and verifies the complete ordered command stream against each fixture's count and SHA-256.
3. **Memory retention:** load, run, unload, wait 30 seconds, then repeat the same case three times. Compare memory after each settled interval as well as the peak.
4. **Responsiveness/recovery:** open/close Status while streaming, pause, wait five seconds, resume, and stop a separate partial run. Watch for long UI stalls, resets, lost connection, process exits and incomplete commands.
5. **Visualizer interaction:** compare pan/pinch gestures while idle and while streaming, plus untouched-view streaming windows. See [visualizer capture procedure and metrics](VISUALIZER.md). The new opt-in in-app gesture telemetry requires a future build; existing Build 45 captures cannot provide those measurements retrospectively.

The simulator performs no physical movement. It models an acknowledgement rate and a 1024-byte receive buffer (matching the grblHAL sender default), **not motor acceleration or actual machining time**. TCP over ADB exercises file processing, the UI and the sender, but not the Android USB serial driver. A later controller/check-mode test can cover that path. A passed simulation is not a physical-machine reliability certification.

## Workloads and progression

| Profile | Purpose |
| --- | --- |
| contour | Relatively simple straight paths; sender/baseline workload |
| relief | Dense short XYZ segments; many vertices and frequent position updates |
| arcs | Repeated G2 semicircles; arc processing and visualizer expansion |

Begin with **128 KiB**, then **1 MiB**, **5 MiB**, **20 MiB**. Only generate/test **50 or 100 MiB** after the previous steps are stable. A file's line/segment count matters as much as its byte size. Start streaming at 500 acknowledged lines/s; compare 100 and 1000 lines/s in separate runs. These are test workloads, not assumed SLB performance specifications.

Stop the progression on a crash, missing commands, sustained UI freeze, memory guard, or an unexplained increase after repeated unloads. Do not keep increasing file sizes after the tablet becomes unstable. The guard is best effort: a rapid memory spike can occur between samples.

## Start a run

Disconnect physical CNC hardware. Keep the tablet connected to the Mac with USB debugging, unlocked and displaying gSender. Avoid other changes during a comparison; record charging state, orientation, visualizer settings and tablet model. Keep Tilt jog off.

From this directory:

```sh
python3 jobs.py --out ./fixtures --kib 128 1024
python3 grbl_sim.py --rate 500 --fixtures ./fixtures --log ./results/contour-128KiB/simulator.jsonl
```

In a second terminal, substitute your ADB path and serial number (from `adb devices -l`):

```sh
python3 tablet.py --adb /path/to/adb --serial TABLET_SERIAL --out ./results/contour-128KiB prepare --fixtures ./fixtures
```

In gSender **Config**, search **Ethernet**. Note the old settings, set **Connect to IP = 127.0.0.1**, **Ethernet port = 2323**, and press **Apply Settings**. Back in Carve, connect to that IP. The reverse tunnel routes it to port 18823 on this Mac. The simulator prints `connected`. Never select a physical controller for these fixtures.

Then begin recording:

```sh
python3 tablet.py --adb /path/to/adb --serial TABLET_SERIAL --out ./results/contour-128KiB record --seconds 300 --stop-app-on-limit
```

The optional `--stop-app-on-limit` flag force-stops only gSender if available memory drops below 512 MiB, app PSS exceeds 1024 MiB, or telemetry fails repeatedly. Use it only for the isolated simulator run. These are conservative test guardrails, not measured device capacity limits.

Open the bottom tray, select **File > Load File**, then use the normal file picker: **Downloads > gSender-benchmark > contour-128KiB.nc**. If Downloads shows an empty folder, use the picker sidebar **tablet name / internal storage > Download > gSender-benchmark** instead; ADB-copied files may not be indexed by the Downloads provider. Load, start, pause/resume, finish, unload and let memory settle. Keep the collector running while doing so. Save phase markers from another terminal at each action:

```sh
python3 tablet.py --serial TABLET_SERIAL --out ./results/contour-128KiB mark contour-128KiB load-start
python3 tablet.py --serial TABLET_SERIAL --out ./results/contour-128KiB mark contour-128KiB load-ready
# Other phases: run-start, run-finished, pause, resume, unload, settled
```

`load-ready` is an observed/manual time, including reaction or automation latency; it is not internal parser instrumentation. Use consistent observation criteria between builds. Simulator `job_completed` is the precise stream-completion marker; it is not the app's preview-load time.

Stop recording with Ctrl+C for an early finish. Stop the simulator with Ctrl+C, disconnect its gSender connection, **restore the original Ethernet settings and apply them**, then remove the tunnel:

```sh
python3 tablet.py --adb /path/to/adb --serial TABLET_SERIAL --out ./results/contour-128KiB cleanup
```

The setup uses `--no-rebind`, so it refuses to replace an existing tunnel. It leaves your test files in Downloads for reuse. No device logs are cleared.

## Results and interpretation

Each recording produces `samples.csv`, `samples.jsonl`, `summary.json`, Android exit history before/after, logcat, thermal status, and graphics frame statistics. The simulator produces structured `job_started` / `job_completed` events with exact acknowledgement count, checksum, throughput, largest receive gap and receive-buffer violations. Use `--fixtures` to verify against all generated fixture sidecars, or `--job` with a single matching fixture. `expected_match: true` is required for a clean stream result; investigate mismatches rather than treating them as performance results.

- App PSS/RSS covers the Android host and embedded Node process. **WebView renderer processes are separate.** Candidate renderer measurements are kept separately because Android can have renderers belonging to other apps; do not silently sum them into gSender memory.
- `cpu_percent_one_core` uses per-process `/proc` counters over the collector interval when Android permits reading them; 100% means one CPU core. `cpu_percent_system_window` is Android's separate, sometimes stale window. Neither includes the separate WebView renderer. Battery temperature is not CPU temperature; thermalservice is captured separately.
- `gfxinfo` frame statistics help identify UI jank but do not measure every JavaScript task inside WebView. Simulator status-poll gaps are a backend responsiveness clue, not proof of UI responsiveness.
- A signal-9 exit alone does not prove out-of-memory. Compare Android exit reasons, renderer exits, low-memory-killer messages, `OutOfMemoryError`, V8 heap failures and the preceding memory samples.
- macOS simulator timing, USB debugging overhead, and telemetry sampling affect results. Compare the same setup across builds and repeat runs. No full-rate per-line console logging is used.

Useful next comparison: load the same file with the normal visualizer, lightweight view, and visualization disabled, if supported by that interface. That helps distinguish parsing/sender memory from rendering cost without changing the app.

Generate a readable summary after recording:

```sh
python3 report.py ./results/contour-128KiB
```

This writes `REPORT.md` next to the raw capture. Keep the simulator log in that same result folder. If testing multiple cases in one capture, label them with phase markers; the summary's CPU/memory peaks then cover the entire session, not one individual case. Pause durations are included in simulator elapsed time and reduce the reported average lines/s.

## Tool checks

```sh
python3 -m unittest discover -s . -p test_benchmark.py -v
```

The tests cover deterministic fixtures and checksums, fragmented input, pause/resume, cancellation, and Android memory parsing.
