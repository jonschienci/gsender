# Build 45

Version: `1.6.4-android.45-node24-prototype`.

- Enabling Tilt jog automatically shows the XY pad as a direction indicator. Its point and direction line follow the same screened X/Y input sent to the motion planner. This represents commanded direction and intensity, not measured machine position. Disabling tilt restores the previously selected manual jog view.
- The indicator centers in the dead zone, during calibration or planner recovery, and after stale input or an interruption. It is display-only while tilt is enabled: it does not poll the backend or start a separate touch-jog session. Only the point subscribes to sensor-rate updates, avoiding full jog-container renders on every sample.
- The flat dead zone increases from 3 to 6 degrees; full selected preset speed is reached at 40 degrees instead of 25. The existing smooth speed curve, 60-degree cutoff, sensor freshness checks and motion leases are preserved. Simultaneous Z jogging and live preset changes remain available.
- The fully expanded bottom tray starts directly below the 56-pixel connection/status bar and extends to the top of the 64-pixel bottom navigation. This holds in portrait and landscape, including when the status section is expanded. The bottom chevron still completely opens or hides the tray.

## Validation

- All 284 regression tests passed, covering the widened tilt range, displayed direction, calibration/recovery/stale-input centering, passive-pad behavior, automatic view selection/restoration, Z availability, and the existing motion/USB tests. The final APK's extracted backend also passed its simulated USB motion test, including combined X/Y/Z operation and Z release.
- Production desktop and pendant bundles and the optimized release APK built successfully. Android lint reports 0 errors and 9 existing warnings.
- Browser previews verified exact tray alignment in portrait (800 x 1249 CSS px) and landscape (1280 x 600 CSS px), status open/closed, Console tab selection, tray collapse, and normal jog/XY-pad layout.
- Version 45, release flags, matching signing certificate, Node 24.21.0 and armeabi-v7a verified. No tablet installation, physical machine motion or repository push was performed.
