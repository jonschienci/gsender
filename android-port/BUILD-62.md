# Android Build 62

Build 62 integrates the approved September 30 UI design into the Android app, retaining the Build 61 job-start fix, passive job logging, homing fixes, and local benchmark fixture.

- Compact connection control; machine state above the visualizer with running, paused, and alarm outlines.
- Filename and statistics beside the editor control; tapping the job/progress summary opens the statistics inside the visualizer. Running progress shows filename, completion, elapsed time, and remaining time.
- Updated feed/spindle/laser layout, coolant toggle, and wheel edge taps with short visual feedback. Wheel steps remain 5% or 500 RPM; manual values stay exact.
- DRO units inside the coordinate fields, adjusted numeric keypad placement, and the revised Z height ruler with orange machine-travel end marks.
- Orange XY machine boundary, grid constrained to configured travel, job-only dimension labels that keep their screen size while zooming, and default centering on the loaded job or current machine position. Machine/work offsets are applied to the boundary.
- Explicit UI state styles for older WebViews, including the connected MP3566 tablet.

Preview fixtures, demo routes, Figma capture scripts, and unrelated Node runtime experiments are excluded. Physical-machine movement and tablet performance benchmarks are not part of this release validation.

## Validation

- 370 Android regression tests and 23 controller tests passed.
- Both frontend bundles, backend packaging, Gradle release assembly and lint, and APK integrity verification passed.
- Packaged UI checks passed at 800×1280 and 1280×720, including wheel steps/manual values, contained job statistics, tool-change dialog layout, alarm/run/pause styles, machine/work bounds, job centering and zoom-stable labels.
- The visualizer regression confirmed position updates move the marker without rebuilding the toolpath. This is a regression check, not a new tablet frame-rate benchmark.
- APK: `gSender-Android-build-62.apk`, 83,743,870 bytes, version `1.6.4-android.62-node24-prototype`, ARMv7, Node 24.21.0.
- SHA-256: `e0225eac2088d998e7408170c1a33e44d641e6ccb03b49ca92ea75bdf0b9527a`.
- Installed on the Yuxian MP3566 (Android 11, approximately 2 GB RAM, WebView 93.0.4577.62) over paired Wi-Fi ADB. Installed APK hash matched the exported APK; cold startup and the pendant UI were confirmed. Pendant mode was selected through gSender settings on this fresh installation.
