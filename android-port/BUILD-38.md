# Build 38

Version: `1.6.4-android.38-node24-prototype`.

- The tablet XY pad is circular, up to 360 CSS pixels across, and has eight marked outer-rim directions. Tap and release in one sector for one finite jog using the saved Precise XY distance and feed rate. The selected Normal/Rapid preset does not change these rim steps. Metric/imperial conversion and limit filtering use gSender's existing jog utilities.
- A held rim touch does not repeat or become continuous motion. Sliding away, leaving the rim, losing pointer capture, a second finger, disabling the control, backgrounding or changing units cancels the pending tap.
- Starting at the center still enables the variable-speed drag gesture and Build 37 recovery. Moving onto the rim during that gesture stays a drag; releasing it stops without adding a step.
- The pendant's XY buttons are larger squares. Z/A buttons are also square and arranged in a separate side column. Existing short/long press behavior and haptics are retained. Both standard and pendant views receive the rim-tap pad; the standard view's original SVG jog wheel is retained.
- The Build 37 APK and backup remain unchanged. No knob firmware update is needed.

Validation uses the real React components, existing jog utilities, simulated CNC backend and browser layout checks. Physical tablet/CNC feel remains for the user to confirm. No physical CNC motion or APK installation was performed during development.

## Verification

- All 260 Android-port/USB regression tests pass, including tests against the finished APK. Main/pendant frontend builds, release assembly, Android lint, APK runtime verification and signing checks passed.
- In the compiled pendant UI, an X+ rim tap with Normal selected changed the simulated CNC position by the saved Precise distance of 0.5 mm.
- Browser measurements: at a 1280 × 740 viewport, the pad is 360 × 360, XY buttons are approximately 113 × 113, and Z/A buttons are 80 × 80 CSS pixels. At 800 × 1220, the pad is approximately 275 × 275, XY buttons 85 × 85 and Z/A buttons 72 × 72. The standard-view pad measured 270 × 270 at the portrait viewport.
