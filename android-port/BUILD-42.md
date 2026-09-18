# Build 42

Version: `1.6.4-android.42-node24-prototype`.

- Enabling Tilt jog now locks the display in its current orientation, including portrait, landscape and reverse orientations. Tilting the tablet cannot rotate the app or change the screen-relative jog directions.
- Turning Tilt jog off restores the activity's previous orientation policy. The same cleanup runs on backgrounding, focus loss, page navigation and destruction, and on sensor startup failure. The system auto-rotate preference is never changed.
- Repeated sensor-start requests preserve the original orientation policy and do not briefly unlock the display. Existing sensor freshness checks, flat neutral, jog speed curve and motion limits are unchanged.

Implementation uses Android's [SCREEN_ORIENTATION_LOCKED](https://developer.android.com/reference/android/content/pm/ActivityInfo#SCREEN_ORIENTATION_LOCKED) activity setting.

## Validation

- Both production interfaces and the release APK built successfully.
- All nine tilt regression tests passed, including native filtering, stale sensor input, delayed replies and foreground/touch interruption.
- The finished APK's backend passed the simulated USB test for regular jog, XY pad, tilt speed limits, sensor loss and knob handover.
- Android lint: 0 errors, 9 existing warnings. Signature, version 42, native sensor bridge, payload, Node 24.21.0 and armeabi-v7a verified.
- Physical display rotation has not been tested on a tablet. No device installation or physical machine motion was performed.
