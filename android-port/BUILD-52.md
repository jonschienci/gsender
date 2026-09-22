# Build 52 — offline tablet benchmarks

Build 52 adds **Tools → Benchmark** to the standard interface and pendant interface. Standard Tools opens the pendant benchmark view without changing the saved startup preference. The quick check and full suite run on the tablet, include panning and 2× viewport zoom, and save exportable JSON reports locally.

The full suite includes the real mountain-relief carving and generated 128 KiB–40 MiB jobs. Physical CNC connections are blocked during simulation. Stop, foreground loss, a missing UI heartbeat, and low available system memory end a run. Reports remain accessible after restarting the app.

This build retains Build 51's approved interface and rendering improvements. No unrelated UI-task changes were imported. The native Node 24.21.0 runtime and existing direct USB connection remain in use.

See [benchmark workloads, logging and interpretation](benchmark/README.md). The simulator's on-device resource use makes these results a different baseline from Mac-driven tests. Native PSS does not include the isolated WebView renderer; automated viewport timings do not measure physical finger latency.

## Validation

- 316 automated tests passed, including complete/partial streaming sequences, command checksums, physical connection isolation, low-memory stopping, fixture hashes, authenticated routes, report parsing and actual renderer integration.
- Both frontend bundles compiled; Android release assembly, release lint and APK/runtime verification passed.
- Final release APK: `gSender-Android-build-52.apk`, 83,191,814 bytes; SHA-256 `1a34e978c626ea53222d7d4a436e34730c5b73166f9ade61f8e6ee4e5e2e1e8c`.
- Lenovo TB-8506F, Android 11: offline quick check completed in 144.2 seconds, with no ADB reverse connection. Received all 25,898 commands with the expected checksum, zero RX overflows, and 499.37 commands/second. Export through Android's file picker succeeded.
- The final device report recorded 2× viewport zooms and actual preview redraws. Idle frame-gap p95 was 16.8 ms; the fully streaming animation window measured 116.7 ms. The display reached Idle 60.07 seconds after simulator completion. These are measured limitations of the current app, not performance improvements introduced by this release.
- Native host-app PSS peaked at 183.3 MiB and sampled system available memory fell to 756.3 MiB during the quick check. Host-app PSS excludes the isolated WebView renderer.
- Leaving the app cancelled a second run and retained its report. Earlier reports survived app replacement/restart.
- The full suite is packaged but was not run end-to-end on a tablet for this release. K90 and K50 require their own on-device runs; they were not connected during validation.
