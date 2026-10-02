# Android Build 64

Build 64 incorporates the approved October 1 UI through the rotary dial, on the Build 63 backend and renderer.

- X/Y coordinate readouts sit by the tool marker. Z remains on the height ruler; enabling the rotary axis adds a compact A dial with rotating ticks and a fixed pointer. The former DRO container is intentionally empty, matching the approved design.
- Tap a coordinate to edit it inline; hold it for Zero, individual-axis Home, and Return to Zero. Readout actions close and remain blocked while a job is running. Existing controller homing restrictions still apply.
- The number pad supports +, −, × and ÷ with normal operator precedence; the full expression is evaluated on Enter. Clear and Enter buttons require a 650 ms hold. Linear entries convert display units to the controller's modal units; A remains in degrees.
- The minor grid, job-bound labels, Z ruler and bottom/ruler fade regions match the approved design. Coordinate targets remain mounted during position reports, retaining pointer holds without rebuilding SVG overlays.
- Build 63's bounded filename ticker, alarm detail, origin rebasing, 2D geometry reductions, kiosk behavior, USB and jogging are retained. Numeric Z text remains legible in both themes.

## Validation

381 Android/USB regression tests and 23 controller tests passed. Packaged-browser checks covered portrait and landscape coordinate entry, hold actions, running-job restrictions, persistent readout targets, real rotary settings, feed/spindle states, tool-change panels, and the long-filename/origin/alarm regressions. Android release assembly, lint and payload verification are recorded in the local Build 64 release artifacts.

No new on-tablet job benchmark or physical machine run was requested for this UI release. Build 63's performance findings and limitations still apply; this release makes no new 30 FPS claim. Design preview servers, forced machine states and separate runtime experiments are excluded.

## Artifact

- APK: `gSender-Android-build-64.apk` (83,755,922 bytes).
- Version: `1.6.4-android.64-node24-prototype`; ARMv7, Node 24.21.0.
- SHA-256: `af16424017b91068c904e20df0ceb34dd3f5369c570bef96b319b883ac13dbcf`.
- Source and release artifacts remain uncommitted until requested.

## K90 installation

Installed over USB on the connected K90_ROW, preserving app data. Android reported versionCode 64; the installed APK hash matched the exported artifact. The app reached the main UI, with Build 64 and the enabled rotary dial visible. Captured startup logs contained no matching fatal exception, out-of-memory or “gSender stopped” message. No machine commands or on-tablet benchmarks were run.
