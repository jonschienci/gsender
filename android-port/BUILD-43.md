# Build 43

Version: `1.6.4-android.43-node24-prototype`.

- Guard GRBL and grblHAL startup after every asynchronous delay. Disconnecting or replacing a controller cancels the old initialization, preventing null `write`/`trigger` accesses and false controller-ready events after teardown.
- Deliver Android tilt sensor events on a dedicated handler thread so busy UI work does not stall sensor sampling. Keep the existing 150 ms freshness check, flat neutral requirement, current-orientation lock and foreground restrictions. Sensor startup and orientation restoration failures are handled without escaping the activity cleanup.
- Changing Precise, Normal or Rapid preserves the active tilt session. Touching a preset temporarily requests zero motion; releasing it resumes with the selected feed ceiling after cancellation of the old planner queue.
- Z buttons remain available while Tilt jog is enabled. They use the existing gSender short/held jog handlers after XY cancellation and a fresh idle check. A released or expired press cannot start delayed Z motion. Tilt mode stays enabled; lay the tablet flat briefly after Z jogging to resume tilt control. XY/A buttons remain unavailable while tilt owns XY movement.
- Expand the portrait DRO into the previously unused width beside the jog card, preserving the jog card's size and an 8 px gap. Landscape dimensions are unchanged.

## Validation

- All 274 regression tests passed, including controller teardown at each startup delay, replacing initialization, live preset changes, sensor interruption, Z handover and released-button cancellation.
- Both production interfaces and the optimized release APK built successfully. The finished APK passed the simulated USB test for ordinary jog, XY pad, tilt, Z handover, interrupted controller startup and reconnect.
- The same packaged-backend regression fails against Build 42 with `GrblHalController.initController` accessing a null connection during startup teardown. Build 43 passes. The user's photographed null `event.trigger` is another continuation in that same startup method; the unit tests cover every delay.
- A source-level isolated sensor probe on the connected K90 compared the actual old/new native sensor classes. During a deliberate 350 ms main-thread stall, Build 42's sample aged to 358 ms and was rejected; Build 43 kept sampling, with a valid 13 ms-old reading. Both stopped cleanly. This probe used a fake activity for orientation-policy calls and did not install the APK or connect to a CNC.
- K90 logs contained no retained Java crash trace; the last recorded exit was SIGKILL. This does not establish the cause of that earlier process exit. The existing installed Build 42 app did report the requested locked orientation while Tilt jog was enabled.
- Portrait (800 x 1249 CSS px) and landscape (1280 x 600 CSS px) previews were inspected. The portrait gap is 8 px; DRO actions and landscape controls remain inside their containers.
- Android lint: 0 errors, 9 existing warnings. Signing certificate, version 43, non-debuggable release, native sensor bridge, packaged payload, Node 24.21.0 and armeabi-v7a verified.
- No APK installation, repository push or physical machine motion was performed. Full-app tilt motion on the K90 and Lenovo still needs a machine-side test.
