# Build 59 — completed UI refinements, tray compatibility and kiosk

Version `1.6.4-android.59-node24-prototype`. APK `gSender-Android-build-59.apk`.
Retains the Build 58 Node 24.21.0 ARMv7 runtime, app identity and signing key.

## Changes

- Includes UI work completed before the September 28 timeline-drawer task:
  larger Feed Rate/Spindle Speed headings, full-height portrait wheels with
  padding, and wider Forward/Reverse controls. Existing reset-icon contrast is retained.
- Places the existing manual tool-change wizard inside the pendant visualizer.
  Wires the upstream tool-change instructions, confirmation and step events into
  the pendant, with subscription cleanup; no mock machine state is packaged.
- Fixes collapsed Macros/Console drawers on older Android WebViews by selecting
  supported viewport units before evaluating tray-height expressions.
- Adds Android managed lock-task support after explicit device-owner enrollment.
  Five taps on Build within two seconds exit or re-enter kiosk; touching elsewhere
  resets the sequence. The choice survives restarts. Missing UI or backend failure
  releases lock task. Installation alone does not enroll a tablet. See [KIOSK.md](KIOSK.md).
- Excludes the in-progress timeline drawer, preview fixtures, Figma capture hook,
  editor experiments and alternate runtime work.

## Validation

- 345 Android regression tests and 23 controller tests passed, including kiosk
  lifecycle/tap timing and tool-change event/cleanup checks.
- Both frontends and backend compiled; release assembly, lint, payload/native
  integrity, signing and build-label checks passed.
- Packaged browser checks passed in portrait/landscape: wheels, custom entries,
  DRO editing, jog pages and the contained tool-change wizard. Simulated commands
  were intercepted; no physical machine commands were sent.
- Installed and verified on YC-SM08M (Android 11, WebView 104). Detailed kiosk and
  tray checks, portrait/landscape exit, restart persistence, blocked Home/Recents/Back,
  and file-picker return are recorded in `work/build59/device-ADPCP5E260406586/kiosk-results.json`.
- On this tablet an edge swipe can briefly reveal the manufacturer system strip;
  managed app-switching restrictions remain active.
- No new performance benchmarks. USB attach/permission/reconnect in managed kiosk
  still needs testing with the real controller after disconnecting the Mac.

Size: 83,233,694 bytes. SHA-256:
`6dabb6dc6cabe07328f11ab806b423a1eebdb9f232c3843e77a6dc5a5e5a59fa`.

Frozen source and validation: `work/build59/`. APK/signing/generated/device
artifacts stay outside Git. Changes are included in the [Build 60](BUILD-60.md) release commit.
