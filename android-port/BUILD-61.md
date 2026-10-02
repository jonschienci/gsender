# Build 61 — job reliability and job information

Version `1.6.4-android.61-node24-prototype`. APK `gSender-Android-build-61.apk`.
Retains the Node 24.21.0 ARMv7 runtime, signing identity and five-tap kiosk controls.

## Changes

- Prevent late jog cancellation from the automatic feed/spindle page switch from
  discarding streamed job commands. This addresses a reproduced defect found
  after the K90 spindle-without-motion report; the historical incident was not
  conclusively reconstructed. Details: [job diagnostics](PENDING-REAL-JOB-DIAGNOSTICS.md).
- Automatically record bounded, passive diagnostics during physical jobs. Export
  them from **Tools → Job logs**. Logs stay on the tablet unless exported, retain
  twelve sessions, and do not send commands or resume jobs. Existing simulations
  are excluded. The user's skull finishing job is also included as a local-only
  benchmark fixture; it is not published in Git.
- Long-press Home still opens axis choices; tap an axis to home it. grblHAL uses
  its per-axis homing path. If single-axis homing is disabled in firmware the app
  explains it without changing EEPROM. Go To retains G0.
- Add a Z-only scale on the visualizer's right edge for configured machine travel,
  current Z and loaded toolpath Z range, independent of XY pan/zoom. Job height
  includes rapid and retract moves, not just material thickness.
- Feed/spindle percentage wheels snap to 5%; spindle RPM snaps to 500 RPM.
  Manual entries stay exact within existing permitted limits until the wheel is
  moved. Repeated movement within a single step does not resend value changes.
- Tap the visualizer toolbar's filename/size/line summary for job statistics:
  estimated duration, exact file size, lines, type, bounds, units, tools, axes,
  programmed F/S ranges, flagged-line count and current-run elapsed/remaining time.
  The panel uses existing metadata without reparsing G-code.

Retains the approved Build 60 layout. Unrelated runtime/editor experiments and
Figma capture code are excluded from the frozen release source.

## Validation

- 367 Android tests and 23 controller tests passed.
- Both frontend variants and backend compiled; release assembly/lint, APK signing,
  payload/native integrity, runtime provenance and Build 61 labels verified.
- Packaged browser checks covered portrait/landscape, wheel steps and custom RPM,
  job-statistics opening/closing with real parsed metadata, Z indicators, job-log
  API initialization, numeric entry, timeline and tool-change UI. CNC commands
  were intercepted and simulated locally.
- Installed on K90 (`K90YCU16B251101432`), preserving app data. Installed APK checksum
  matched and a cold launch showed Build 61. No machine job or tablet benchmark
  was run. Physical-machine verification of the pending fixes remains necessary.

The measured performance baseline remains the Build 55 report. Frozen source,
logs and validation evidence are in `work/build61/`. No commit or push was made.

APK: 83,738,198 bytes. SHA-256:
`a063230a3fc5de7a4504dafad5adbfd2690bb2cc0d7399f3bea795a15e51563e`.

Install with `adb -s TABLET_SERIAL install -r /path/to/gSender-Android-build-61.apk`.
