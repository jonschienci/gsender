# Android Build 65

Build 65 incorporates the completed October 1 UI design on the Build 64 backend and renderer. The Android activity now stays in portrait, as requested in the UI task.

- Tap a coordinate for Zero/Home/Return; hold for the inline value editor and arithmetic keypad. Running-job restrictions and hold-to-enter/clear remain.
- The former DRO pane now contains Tools, Probing, Prep and Console. Actual tool-change instructions and ATC controls live under Tools; the tool timeline stays in the viewport. Narrow screens wrap tabs and wizard controls so every action remains reachable.
- Prep opens the existing surfacing generators and loads generated jobs through the pendant file loader. Home and Zero All are in Probing. The bottom Tools page is named Plugins.
- Misc provides Laser, Rotary and ATC switches. Laser uses the existing controller mode-change implementation and is disabled during jobs. Rotary and ATC visibility are saved preferences; enabling ATC visibility does not invent controller capabilities.
- The rotary dial is smaller, with rotating degree labels, a fixed pointer and revolution indicator. File loading hides viewport instruments and fades. Disconnected mode shows one yellow status message and a connection arrow.
- Viewport buttons center on position, fit the job, or fit machine travel around overlay controls. Holding Center enables tracking; redraws follow changed position reports rather than an idle animation loop.
- Console expands into the tray and can be minimized. The filename is content-sized, capped at one-third of the viewport, with the existing ticker; editor, Close File and job controls retain their own space.

## Validation

381 Android/USB regression tests and 23 controller tests passed. Release assembly, Android lint and packaged payload verification passed. Packaged-browser checks use an isolated simulated controller and intercept machine commands: coordinate editing, rotary input, feed/spindle restrictions, tool-change containment, filename/origin/alarm behavior, preparation forms and viewport tracking are covered. Local validation artifacts are under `work/build65` in the development workspace.

No physical CNC job or on-tablet performance benchmark was run for this UI build. Existing performance findings and limitations still apply. Design-only demo states, Figma capture code and unrelated runtime experiments are excluded. Source and release artifacts remain uncommitted until requested.

## Artifact

`gSender-Android-build-65.apk`; version `1.6.4-android.65-node24-prototype`; ARMv7, Node 24.21.0. Install with `adb -s SERIAL install -r gSender-Android-build-65.apk` to preserve app data.

Exported APK: 83,998,046 bytes. SHA-256: `c6c7f396f1bc40860ae89ba9f721d7bb1d601920a9486037510a0055d21fce4b`.

## Installation check

Installed on Lenovo TB-8506F (`HA1P19R6`) with app data preserved. Android reported versionCode 65 and the installed APK hash matched the exported artifact. Cold launch reached the portrait main UI; the captured startup log had no matching fatal exception, out-of-memory, uncaught JavaScript error or “gSender stopped” message. No CNC job or tablet benchmark was started. On October 2, Build 65 was also installed on the K90 (`K90YCU16B251101432`) with app data preserved. The installed APK hash matched, the portrait main UI was visible, and captured startup logs had no matching fatal, memory or uncaught JavaScript errors. No machine job or benchmark was run.
