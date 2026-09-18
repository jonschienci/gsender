# Build 41

Version: `1.6.4-android.41-node24-prototype`.

- Add a **Tilt jog** switch immediately after **CNC knob** in the expanded bottom tray. It defaults off and uses Android's gravity sensor, or a filtered accelerometer when no gravity sensor exists. No location access or additional permission is needed.
- Set **Precise**, **Normal**, or **Rapid**, enable Tilt jog, and hold the tablet face up and flat for 0.4 seconds. Tilt toward the screen direction in which the machine should jog. Within 3 degrees of flat the requested speed is zero; between 3 and 25 degrees it follows a smooth speed curve up to the selected preset's configured feedrate. Diagonal movement shares that speed limit. Only X/Y move.
- Tilt uses the existing bounded tablet-pad backend, acceleration limits, cancellation, fresh-input lease and exclusive control of the physical knob. Regular touch jog controls are disabled while Tilt jog is on. Touching other controls pauses tilt until the tablet returns flat; machine controls, app backgrounding and focus loss switch it off. Sensor loss, orientation or preset changes, and link interruptions require flat neutral before motion can resume. It never restores an enabled state at launch.
- Remove the speed/feed readout and its footer from the XY pad. The pad has no visible status or speed text below it; accessible status announcements remain.
- In landscape, put A-axis jog buttons to the left of the regular XY buttons or circular XY pad, with Z-axis buttons on the right. Reuse the original controls and handlers, including hold/release behavior and haptics. Portrait retains the Z/A stack.
- Reduce the jog card width by 10% in both orientations, keeping it aligned to the right. DRO dimensions and the compact header are retained.

Validation uses deterministic sensor samples and a simulated CNC. Physical tablet tilt response and motion feel still require a machine-side check; start in Precise. No physical machine is commanded and the APK is not installed automatically.

## Validation

- Both production frontends and release APK compiled successfully.
- All 271 regression tests passed, with no skips. This includes native gravity filtering in all four screen rotations, flat neutral, smooth speed curve, sensor stalls, preset changes, delayed replies, foreground/touch interruption, and knob handover.
- The final APK backend passed an additional simulated USB test covering regular jog, XY pad, tilt speed bounds and sensor loss.
- Portrait (800 × 1249) and landscape (1280 × 600 and 1280 × 686) layout checks passed: square controls, circular pad, no speed footer, 10% narrower card, correct axis placement and contained DRO/header.
- Android lint: 0 errors, 9 existing warnings. Signature matches preceding builds; Node 24.21.0, armeabi-v7a, version 41 and non-debuggable release verified. Native sensor bridge survives shrinking; no preview helper is included in the payload.
