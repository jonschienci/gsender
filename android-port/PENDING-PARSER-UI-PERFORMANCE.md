# Parser and K90 responsiveness fixes — 2026-10-02

These prepared fixes are included in **[Build 66](BUILD-66.md)**. The results below preserve the original pre-build Chrome investigation; see the build note for packaged-app validation and the K90 check. No commit or push was made.

## Findings and changes

- Panning was slow even with no file: the crosshair shared the grid/toolpath SVG surface. Moving the same crosshair into a separate composited SVG, synchronized to the exact same camera, removed most of that cost. It remains visible, follows live position, uses the same stroke, and does not intercept gestures. Geometry, machine coordinates and commands are unchanged.
- Ordinary Android taps waited about 283 ms between release and click despite an idle main thread. `touch-action: manipulation` removes the browser's double-tap wait. Existing custom hold gestures, five-tap kiosk exit, and the jog/pad controls' `touch-action: none` remain in place.
- Imported upstream parser allocation improvements: reused move scratch positions, direct worker callbacks, allocation-free distance/time calculations, sparse laser spindle metadata, and no unused SVG path strings. Invalid-line samples are capped at 100 while warnings retain the full count.
- Reconnect reuse checks the entire file plus parse settings, theme and successful-load state; explicit reloads, changed settings/content, unloads and cancellations still parse. A superseded request can no longer start after yielding for the loading overlay. Fixed the shared worker response's processing/render-state action payloads and removed its delayed stale render-state update.

Source: upstream `dev` inspected at `81fc7f8ad`; scoped backports of [a4984082e](https://github.com/Sienci-Labs/gsender/commit/a4984082e45b976674e2704a4cd65a6ec644bf7b) and [bf9db3e6b](https://github.com/Sienci-Labs/gsender/commit/bf9db3e6bb28319c2ca2fbe1ce05c1459d3ade25). The existing Android compact, deduplicated 2D transfer format is retained. This is not an import of the whole dev branch, its newer 3D `segments-v1`/gviewer contract, or its MotionPlanner estimator rewrite.

## K90 comparison

Android 16; 1200 × 2000 display; portrait frontend. Saved skull finishing job: 1,405,319-byte local simulation fixture, 63,208 commands. All original machining lines are retained; the fixture is local-only.

| Measurement | Build 65 frontend | Prepared changes |
|---|---:|---:|
| Empty connected view, pan/zoom average | 7.2 fps | 57.6 fps |
| Skull loaded, pan/zoom average | 40.7 fps | 44.2 fps |
| Skull with 10 Hz position/progress, pan/zoom average | 37.1 fps | 44.0 fps |
| Live skull case, longest sampled frame gap | 300.1 ms | 33.5 ms |
| Skull worker total, median of three | 498.1 ms | 416.4 ms |
| Ordinary tap release-to-click, median of eight | 284.2 ms | 6.0 ms |

Skull worker time fell approximately 16%. Transferred geometry remains 1,010,848 bytes, with identical geometry hashes, bounds, command/statistics counts and total estimate. This file does not demonstrate a memory reduction: the pendant already omits 3D/color/SVG-string buffers, and worker heap telemetry was unavailable.

These are **K90 Chrome tests of the production frontend**, not measurements from a newly installed WebView APK. Pan/zoom cases were five-second scripted sweeps. Live tests injected display reports without a real CNC connection or motion. They support the identified fixes but do not establish sustained 30 fps across arbitrary files, other tablets, or actual machining. Build 66 now packages these changes; real-machine validation remains separate. Native Build 65 counters also showed slow draw submission, but those counters were not used for before/after claims.

## Validation

- 32 targeted tests pass: parser/geometry, bounded invalid warnings, laser metadata, reconnect/cancellation, real renderer pan/pinch/wheel, marker visibility and disposal, preview lifecycle, display updates and bounds.
- Nine reference programs covering arcs, helix, rotary, inches, offsets, tool changes and laser were compared in 2D, full and laser worker modes. Geometry and job statistics match. Per-line estimates differ by at most 0.0001 seconds from upstream's numeric rounding change.
- Skull output matches on both Mac and K90. The K90 touch-drag check confirms the main SVG and crosshair overlay have identical numerical screen matrices after panning.
- Production pendant frontend compilation passes. No APK was produced. Existing grid drawing was retained after an alternative grid implementation regressed the empty view.

[Machine-readable results](benchmarks/parser-ui-k90-20261002.json). Detailed test logs and CPU profiles are retained locally under `work/parser-ui-20261002/` in the Codex workspace.


## Approved next-build plan — 2026-10-02

The user requested that the next build combine the prepared parser, panning and touch-response fixes above with the best selected improvements from upstream `features/android`. This records the intended implementation and validation; the new items below are not yet implemented. This request does not start an APK build, installation, commit or push. UI design work remains separately controlled; do not automatically pull additional changes from the UI task.

Reviewed upstream source: [63c7d602def4d6ceb8c64a1645eb161bcf838697](https://github.com/Sienci-Labs/gsender/tree/63c7d602def4d6ceb8c64a1645eb161bcf838697). Its [Android workflow passed](https://github.com/Sienci-Labs/gsender/actions/runs/37012808724). It uses the same Node 24.21.0/WebView architecture, with a separate Node executable and USB support still stubbed. Borrow specific techniques while retaining the existing embedded runtime, native USB/control bridges, local authentication, lifecycle behavior and device support.

### Implementation scope agreed before Build 66

1. Retain and package the already prepared parser allocation/reconnect fixes, separately composited live crosshair, and removal of ordinary Android double-tap click delay. Preserve precise geometry, coordinate alignment, custom gestures and current motion behavior.
2. Bundle the backend's supported JavaScript dependencies into a compact production bundle. Keep native adapters explicit, reject unexpected unresolved dependencies, and include required runtime assets and licenses. Preserve external source maps for diagnostics without shipping them unnecessarily. Build 65 currently ships 6,100 dependency files occupying 28.18 MiB unpacked; this is a packaging baseline, not an estimate of achievable savings or running-memory improvement. Verify isolated extracted-payload startup so development node_modules cannot hide missing dependencies.
3. Enable Node module compile caching in private cache storage before loading the backend; flush it after successful startup. Handle cache absence, invalidation and write failures without preventing launch. Keep the existing RAM-aware heap policy. Measure first-launch cost and repeat-launch benefit rather than assuming either improves.
4. Test creating the WebView only after the backend reports ready. Separate startup timings for payload preparation, Node readiness and interactive UI. Adopt the scheduling change only if tablet measurements support it; retain authentication, kiosk exit availability, file picker, sensor/haptic bridges and USB attachment handling.
5. Stage and verify payload extraction before activation, retaining a recoverable previous payload until activation succeeds. Keep user settings, files and logs outside replacement payload directories. Record bounded startup diagnostics with distinguishable installation/backend/page failures. Recovery must not automatically resume a job or restart a live connection because of a page error; any backend retry must follow a fully stopped runtime and respect the one-start-per-process embedding constraint.
6. Add automated packaged-Android launch checks alongside backend/USB regressions: first install, repeat launch, update, service readiness, authenticated API/UI access, console/crash detection and startup timing artifacts. Add an emulator-compatible runtime target if required; do not treat upstream's x86_64 executable as interchangeable with our JNI library. Test 16 KB compatibility when a matching native runtime is available, and report coverage gaps explicitly.

### Validation for the next authorized APK

- Re-run the prepared parser/renderer regressions and relevant USB, lifecycle, local-access, packaged-dependency and startup tests after integration.
- Use the saved skull finishing job as the primary performance fixture. Compare the installed WebView against the prior APK for empty and loaded panning/zooming, live position/progress, ordinary tap latency, startup timing and memory. Existing Chrome measurements above are supporting evidence, not installed-APK results.
- Start with K90; check Lenovo's ARM32 compatibility and memory behavior, then K50 when available. Preserve real-controller job logs; simulated benchmarking must not open or move a physical CNC.
- Accept improvements based on measured results and functional parity. No blanket 30 fps guarantee; record frame-time spikes as well as averages. Do not import the alternative grid implementation that previously regressed performance.

### Deferred architecture work

Finish ARM64 and explicit 16 KB native-library support as a separately validated runtime change, retaining ARM32 for Lenovo. Current ARM64 scripts are prepared but the runtime is not yet compiled or tablet-validated. Do not make this next performance build depend on a wholesale migration to Kotlin, upstream's separate-process runtime, its planned TCP USB bridge, or a replacement rendering engine. These larger changes have no demonstrated panning benefit and would require additional transport/lifecycle qualification.

## Build 66 implementation status

Implemented the parser/marker/tap fixes, JavaScript dependency bundling with external debug maps and license notices, private Node compile caching, staged checksum-verified payload updates, bounded startup diagnostics, and an automated selected-device launch-check script. The normal UI still starts alongside the backend: K90 repeat-launch page completion was about 3.64 s with either scheduling order, so deferred WebView construction remains an opt-in diagnostic experiment rather than the default. Page-load completion is not an interactive-readiness measurement.

The script was used on an update and repeated K90 launches; isolated packaged-backend tests check authenticated API access. A fresh-install device run, emulator CI job, 16 KB runtime, Lenovo/K50 comparison and real-CNC job remain unvalidated in this build. No whole-branch migration or USB transport replacement was made. See BUILD-66.md for the quick installed-WebView skull simulation.
