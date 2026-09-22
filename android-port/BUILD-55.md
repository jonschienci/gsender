# Build 55 — density-adaptive preview and current pendant UI

Build 55 includes the approved current UI changes and recent XY-pad improvements.
It retains the stable 1.6.4 core, scoped dev jogging/pendant overlay, Node 24.21.0
ARMv7 runtime, package identity and existing signing key.

## Included changes

- Density-adaptive top-down preview: bounded SVG paths for sparse visible geometry;
  worker-rendered images for dense views. Pan/zoom rechecks density, offscreen
  blocks are skipped, and position overlays remain independent. See
  [renderer notes](HYBRID-PREVIEW.md).
- XY rim buttons support continuous jogging when held; short taps remain precise
  steps. Center drags retain pointer capture outside the pad, preserve heading,
  cap speed at Rapid and keep the visible dot within the circle. Larger center
  touch target.
- Latest pendant UI: coordinate grid, machine travel bounds, consistent crosshair,
  revised framing and G-code editor dialog; updated feed/spindle controls and
  Start/Pause behavior; unit/coordinate switches, coordinate editing, individual
  homing selection, hold-to-go-XY, custom jog increments and rotary controls that
  follow the saved rotary setting. Current spacing and sizing are included.

## Validation

- 331 automated regression tests passed, zero failures or cancellations. Two UI
  test fixtures were updated for the new rotary hook and dot positioning.
- Backend and both frontends compiled. Android release assembly, lint, APK/runtime
  verification and signing verification passed.
- Packaged UI checked in portrait and landscape, including coordinate editors,
  rotary visibility, jog pages and viewport bounds.
- Installed on K90 (Android 16), retaining app data. Cold launch succeeded; the
  installed portrait and landscape views were visually checked. Android status
  bar remains hidden and the Build 55 badge is white in dark mode.
- Onboard reports collected from K90, K50 and Lenovo. K50 and K90 completed the
  selected suite; Lenovo completed through the 30 MiB timed case and stopped
  during the 40 MiB preview when system available memory reached 248 MiB.
  Each tablet verified 328,139 commands across the three full jobs with matching
  checksums and zero receive overflows. Larger files use timed samples.
- Build 55 loads more slowly than the last measured Build 53 baseline; K90
  rendering lag persists. All three reports recorded empty SVG frames during
  contour zoom. The clipping/resize fix is pending in source, not in this APK.
  See the [updated performance report](benchmarks/gSender-Android-Build-55-Benchmark-Report.pdf).
  No physical USB throughput or CNC movement was tested.
- Desktop hybrid-renderer check: 250,000-segment overview used raster; zooming to
  289 visible segments used SVG; pan, zoom-out and rapid viewport changes passed.
  Those timings are not tablet measurements.

APK: `gSender-Android-build-55.apk`, 83,205,846 bytes.
SHA-256: `903d259b7b6495c66ce0f9a1d20cbdcf63d5784505adb94973e7246a509c40ad`.

Frozen source, build logs and device captures are retained under `work/build55/`.
Separate native-runtime/workflow experiments and local editor configuration are
excluded. No commit or GitHub push was requested for this build.
