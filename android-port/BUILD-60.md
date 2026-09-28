# Build 60 — current pendant UI

Version `1.6.4-android.60-node24-prototype`. APK `gSender-Android-build-60.apk`.
Retains the Node 24.21.0 ARMv7 runtime, app identity, signing key and Build 59
five-tap kiosk controls. Installation does not enroll a device in managed kiosk.

## Changes

This release also includes [Build 58](BUILD-58.md) feed/spindle wheels and the
delayed controller-report crash fix, plus [Build 59](BUILD-59.md) tray compatibility,
contained tool-change wizard and five-tap kiosk controls.

Includes completed UI design work through September 28, 2026 at 21:22 UTC:

- Tool timeline drawer along the visualizer's left edge, with scrolling colored
  tool badges, current-tool highlighting and an expandable timeline. The original
  ATC tray timeline remains available. The drawer hides outside the Carve view
  and when the bottom tray is open; real file metadata drives it.
- Floating progress, editor and job controls at the bottom of the visualizer.
  File load/close controls appear outside running/paused jobs; empty jobs provide
  Probing and Tools shortcuts. Filename, size and line count appear above the view.
- Compact connection button and inline expandable Status panel; dialogs leave
  the machine header, including E-stop, accessible.
- Refined jog arrows, spacing, DRO coordinate frames, wheel layout, increment
  controls, radii, header and navigation sizing in both orientations.
- One three-dot button cycles jog buttons, XY pad and feed/spindle wheels.
  Starting a job selects the wheels; stop/completion returns to jog buttons.
  Manual page selection remains available throughout a job and pause/resume.
- Clicking the Macros/Console header expands/collapses its tray. The separate
  Spindle tray tab is removed; spindle wheels remain available.
- Revised toolpath fit margins and an origin coordinate label.

Production changes use `scripts/current-ui.cjs`, applied after existing Android
adaptations, `ui/TimelinePopout.tsx` and the shared scoped wheel/layout stylesheet.
The preview's fake machine state, gallery fixtures and Figma capture script are
excluded. Separate runtime/editor experiments are not included.

## Validation

- 345 Android tests and 23 controller tests passed;
  release assembly/lint, payload/native integrity and build-label checks passed.
- Packaged UI checks passed in portrait and landscape: DRO editing, numeric
  entries, jog pages, wheel controls and contained manual tool-change wizard.
- A real file-picker/parser test loaded a 15-tool synthetic file into the
  packaged interface; timeline badges and expansion worked. Idle, running,
  paused and stopped states verified page transitions, manual selection,
  file/progress visibility and spindle-command restrictions. E-stop remained
  hit-testable with the editor open. All machine commands were intercepted.
- Installed on K90; installed APK checksum matched, cold launch succeeded and
  Build 60 interface was visible. No new physical-machine tests or tablet
  performance benchmarks were run.

The measured performance baseline remains the Build 55 report. Validation files
and the frozen build source are in `work/build60/`; APK, signing and generated
files remain outside Git. The user authorized committing this build on
September 28, 2026. This approval does not add physical-machine or performance
validation beyond the checks above.

APK size: 83,241,150 bytes. SHA-256:
`446f3009fdbb7c22df660c2b13e317570b196ac3f84082a695b256ca9339bdd2`.

## Install

Use `adb install -r /path/to/gSender-Android-build-60.apk` to update one connected
tablet while retaining its app data. For multiple connected, authorized tablets,
see the [USB installation commands](README.md#install-on-tablets-over-usb).
The APK is a local release artifact and is not stored in Git.
