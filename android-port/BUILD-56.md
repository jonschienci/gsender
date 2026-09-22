# Build 56 — current pendant UI and visible toolpath fix

Version `1.6.4-android.56-node24-prototype`. Retains the 1.6.4 core with scoped dev jogging/pendant additions,
Node 24.21.0 ARMv7 runtime, application identity and signing key.

## Included changes

- Completed UI task changes: custom feed after Rapid, hold-to-edit feed and increment
  controls, compact numeric keypads, larger DRO/jog header controls, inline units,
  workspace menu stacking, and 500 ms holds for individual axis Go-to/Zero/Home actions.
  Custom feed uses mm/min storage with mm/in display conversion; it feeds ordinary
  jogging, rim holds and tilt. Center-pad dragging retains its Rapid speed cap.
- Fixed numeric keypad integration: fractional/signed entry survives native number
  input sanitization, and newly mounted autofocus fields open their keypad reliably. Coordinate editor text stays readable in dark mode.
- Fixed missing toolpaths after zoom: culling, density analysis, rendering and cache
  coverage include the actual visible SVG extent. Panel resize/rotation refreshes
  the renderer even when the nominal camera viewBox has not changed.
- Incorporates the updated Build 55 three-tablet benchmark report as documentation;
  those measurements remain historical and are not Build 56 performance results.

## Validation

- 334 automated regression tests passed, zero failures/cancellations.
  Existing UI fixtures were updated to cover the current custom-feed fallback and
  bundled jog-step dependencies; a numeric-entry regression was added.
- Both frontends and backend compiled; release assembly, Android lint, embedded
  payload/runtime checks and APK signing verification passed.
- Actual packaged UI checked in portrait/landscape, including decimal input,
  custom-feed selection, keypad bounds, coordinate editing and jog page selection.
- Installed on K90 (Android 16) using `adb install -r`, retaining app data. Cold
  launch and on-device portrait/landscape/keypad checks passed. Rotation restored.
- No new tablet benchmark or physical CNC motion test was run. The clipping fix
  has local geometry/worker and real-Chrome pixel regression coverage; tablet
  performance must not be inferred from these functional checks.

APK: `gSender-Android-build-56.apk`, 83,209,870 bytes.
SHA-256: `b2522bbd9237759a528190f6375ed4f2dd6d367c390ece417cd8251e05744cd5`.

Frozen source, build logs, test results and screenshots: `work/build56/`.
Separate native-runtime/workflow experiments are excluded. No commit or push.
