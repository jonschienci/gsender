# Visualizer follow-up after Build 62

Included in [Build 63](BUILD-63.md). The measurements below were collected during source preparation; the release notes record APK validation and the K90 skull benchmark.

- Constrain the loaded filename and reserve space for editor, Close File, Start/Pause and Stop. Long names scroll using a CSS transform within the filename area; short names remain still, and reduced-motion preferences disable the animation. Progress filenames use the same behavior.
- Remove fixed minimum grid-track heights that pushed the bottom visualizer controls behind navigation on short landscape screens.
- Update the work-origin marker when zeroing or changing WCS. With a loaded file, shift the camera by the work-offset change so the physical machine stays fixed on screen while work zero and the job move. Without a file, show work zero at its machine-coordinate offset. Zoom and toolpath geometry are preserved; missing offsets do not invent a measured origin.
- Open the active alarm description beside the visualizer state. Use the controller-supplied grblHAL description when available, otherwise the bundled firmware alarm table. Dismissing details does not clear/unlock the controller; tapping the alarm reopens them. Repeated status reports do not reopen a dismissed alarm.
- Cache overlay nodes and avoid setting unchanged grid/label attributes during panning. Subscribe status controls to active state/alarm code rather than every controller position report. Equal position snapshots no longer rerender the visualizer.

## Validation

Browser simulation covers long filenames and control separation at 800×1280, 1280×720 and 1024×600, automatic ticker motion, alarm dismissal/recurrence, zeroing with/without a file, and repeat-report camera stability. It intercepts all machine commands. Existing pendant and wheel regression checks also run against the revised web bundle. No Android APK is assembled for these checks.

In the same 60-step pan test, Build 62 made 1,440 redundant grid/dimension-label DOM changes; the revised UI made zero. This is a rendering-work comparison, not a tablet FPS measurement. Toolpath rebuild and marker isolation regressions remain covered.

The connected K90 had no gSender crash in the captured process log. The app process used approximately 310 MiB PSS at capture (this excludes the separate WebView renderer). No physical motion was requested. The cause of the reported lag has not been fully reproduced on hardware; confirm responsiveness on the next authorized tablet build.

## Pendant-only worker optimization from upstream dev

Adapt the [`1f46d3d74` pendant cheap-path change](https://github.com/Sienci-Labs/gsender/commit/1f46d3d74b6d8bcc56d0c93f30f58025502ddae9). The Android pendant already sent `svgOnly: true`, but its 1.6.4 worker ignored it and returned full 3D vertex/color/frame buffers. It now emits compact XY groups directly, skips pure-Z preview segments, and deduplicates identical projected lines across repeated depth passes (including reverse directions). This is top-down line deduplication, not a stock/material-removal or highest-Z surface model. Partially overlapping/distinct visible lines remain.

The existing density-adaptive worker still clips offscreen geometry and chooses bounded SVG or raster rendering by density. Its renderer library remains pinned to the existing version; the unrelated new upstream 3D data contract is not imported. G-code content, sending, motion, estimates, all-axis bounds and Z-height metadata remain unchanged. Secondary/3D and laser requests retain their full geometry path.

The adaptation verifies exact Float32 endpoints after the upstream hash lookup. Distinct sub-0.01 mm lines and hash collisions are kept instead of silently removed. This intentionally favors visible detail over more aggressive simplification.

### Local comparison

Three repetitions per file on Mac Node 24; table timings are medians. These are worker/geometry measurements, not Android FPS or whole-process memory totals. Job statistics matched the original worker for every case.

| Fixture | Display segments before → after | Geometry transfer before → after | Parse time before → after | Main-thread geometry conversion before → after |
| --- | ---: | ---: | ---: | ---: |
| Actual skull finishing, 1.34 MiB | 63,200 → 63,178 | 3.62 → 0.96 MiB | 406 → 497 ms | 10.5 → <0.1 ms |
| Mountain relief, 4.77 MiB | 298,248 → 190,284 | 17.07 → 2.90 MiB | 1,627 → 1,950 ms | 39.4 → <0.1 ms |
| Synthetic relief, 20 MiB | 640,449 → 640,449 | 36.65 → 9.77 MiB | 5,136 → 5,896 ms | 89.7 → <0.1 ms |

Duplicate detection costs extra work during initial parsing: 15–22% more in these checks. It removes the corresponding 3D-to-preview conversion from the UI thread and reduces geometry transfer 73–83%. The mountain job drops 107,909 duplicated segments (36% fewer total display segments); the skull/continuous relief jobs have essentially no repeated XY segments. Do not assume every job will load faster or that the whole-interface lag is resolved.

Forty focused automated tests pass, including actual-worker repeated-depth, reversed-segment, fine-detail, arc/helix/rotary projection, rapid/cut separation, unchanged job statistics and 3D/laser fallback checks. Browser checks pass against the revised web bundle without assembling an APK.

### K90 diagnostic snapshot

Build 62's cumulative Android frame statistics since app launch recorded 2,247 missed-deadline/janky frames out of 2,886 (77.9%); median frame time 77 ms. This includes prior interaction/loading and is not a controlled benchmark. At the later idle capture the system had about 5.3 GiB available memory, battery saver was off, most CPU capacity was idle, and global thermal status was 0 with no active CPU/GPU cooling action reported. The host render pipeline reported Skia/Vulkan; no graphics setting was changed. WebView was 153.0.8010.36. Its GPU timing histogram included saturated values, so no precise GPU time is inferred.

These readings support the reported jank but do not isolate its cause. These were pre-build readings. See Build 63 release notes for the subsequent on-device test; do not compare a controlled benchmark directly with these cumulative statistics.
