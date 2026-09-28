# Build 58 — feed/spindle wheels and disconnect crash fix

Version `1.6.4-android.58-node24-prototype`. Retains the Node 24.21.0 ARMv7 runtime,
application identity, signing key, and Build 57's existing pendant controls.

## Changes

- Incorporates the approved live-preview UI: a third jog page contains vertical
  feed and spindle wheels plus spindle direction controls. The visualizer gains
  the space previously used by its feed/spindle strip.
- Wheels keep the fixed major/minor scale, wider spacing, live feed/RPM readouts,
  larger selected values, symmetric sight-glass frames, and full-width resets.
  Tap a selected value for custom entry using the existing numeric keypad.
- During a running or paused job, the spindle wheel controls percentage override;
  outside a job it selects RPM. Forward/Reverse remain disabled during a job.
  Wheel adjustments commit on release; interrupted/disabled gestures do not
  dispatch a queued command.
- Fixes the Build 57 crash where delayed settings descriptions/groups accessed a
  destroyed GrblHAL runner. Closing/destroying controllers now cancels pending
  reports and parser queries before releasing their state.

## Validation

- 338 Android regression tests and 23 controller tests passed.
- The exact null-settings crash was reproduced before the fix; the regression
  now passes, including replacement connections and normal settings updates.
- Both frontends and backend compiled. Release assembly, lint, payload/native
  integrity, version and signing checks passed.
- Packaged UI checked in portrait and landscape, light/dark, including DRO
  editing, custom feed, wheel/custom RPM entry, and reset-icon contrast.
- Simulated idle/running/paused UI checks verified percentage/RPM switching and
  intercepted the actual override commands. Disabled direction controls emitted
  no commands. No physical CNC, tablet install, or benchmarks were performed.
- Preview job fixtures, Figma capture script, demo controls, and separate runtime
  experiments are excluded. The Build 55 report remains the measured baseline.

APK: `gSender-Android-build-58.apk`, 83,215,374 bytes.
SHA-256: `51c975b0f9fc4b89f8454a7e52629c6898962e3caa20cf2f9c750f3de608f51e`.

Frozen source and verification records: `work/build58/`. APKs, signing keys,
generated outputs and device records remain outside Git. Changes are included in the [Build 60](BUILD-60.md) release commit.
