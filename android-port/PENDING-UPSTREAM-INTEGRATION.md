# Scoped official Android improvements — Build 67

Integrated on 2026-10-06 against personal `android-node24-prototype` at
`4dd9ee211b98895ae5cf7b7fb22af079d8681300` (Build 66), using official
[`features/android` at `2234816dc`](https://github.com/Sienci-Labs/gsender/tree/2234816dc3ac0581bfb9421c37229910af38dd6f)
and the published `@sienci/gviewer` 0.1.42 renderer as references.
This is a selective source backport, not a branch merge or dependency upgrade.
Initially prepared as source-only changes; now included in [Build 67](BUILD-67.md).

## Changes

| Area | Integration | Compatibility |
| --- | --- | --- |
| Pan/pinch/wheel | Adapted upstream CSS gesture previews and cached viewport bounds. Commit the SVG camera on release and at 120 ms checkpoints during long gestures. | The toolpath and separate live-marker layer share the transform. Checkpoints keep the custom hybrid raster/vector preview updating. Camera reset, file replacement, resize and lost capture clear the preview. |
| Discrete jogging | Route `jogAxis` through finite `jog:feed`, following official `90b8174fa`, so held and single-step jogs share acknowledgement ownership. | Keep the selected increment, unit conversion and limit filtering. Retain outstanding replies and a single timer when stepping immediately after a draining jog. XY-pad taps remain finite moves; velocity jogging and tablet/knob ownership guards remain in place. |
| Disconnect | Stop workflow state when either GRBL controller closes, following `90b8174fa`. | Reconnect cannot retain a stale Running state. No automatic job restart. |
| Load progress | Retain the processing filename and percentage in the existing Redux reducer; reset on stop/new load. Addresses the issue fixed upstream in `1fec3b83e`. | Keep the custom loading overlay and parser pipeline instead of replacing them with upstream UI. |
| Controller SD card | Add the pendant `sdcard:files` listener and send YModem EOT as a Buffer, following official `2234816dc`. | Report rejected transfers through the existing error/recovery path, without duplicate errors or an unhandled rejection. FTP behavior is unchanged. |
| Benchmark | Exercise the gesture-preview path during scripted panning and restore the committed camera afterward. | Preserve existing job fixtures, command verification, pan/zoom measurements and onboard logs. |

The existing pinned gviewer 0.1.37 dependency and its compact worker-data contract
are retained. No native host, USB transport, runtime, memory policy, APK identity,
Android API level, release packaging or architecture change is included. This
keeps ARM32 Lenovo support and avoids conflicting with concurrent ARM64 work.

The custom UI, DRO/home popups, Z-height scale, density-adaptive detail, live work
origin, XY pad, tilt plus Z movement, controller/knob support, feed wheels,
haptics, kiosk behavior and real-job logging remain in the personal branch.
No files from the separate UI task are replaced by this integration.

## Validation

Validation uses simulated serial/native interfaces and local browser rendering;
no physical CNC commands are sent. Targeted tests cover finite jog distance,
metric/inch units, limit filtering, disconnect state, load-progress state,
SD file events, transfer-error reporting, pan/pinch/wheel equivalence, marker
alignment, long-drag hybrid refresh, coincident pointers, cancellation and cleanup.

The JavaScript backend and both frontend bundles compile. The existing browser
check passes for portrait, landscape and compact landscape, long filenames,
alarm dialogs, job stats, live work-origin changes, panning and file close, with
no page errors. Actual browser pointer/wheel tests also pass in portrait and landscape, including equal screen transforms for the toolpath and live marker, release cleanup and retained preview visibility.

- Android/USB suite: 387 passed, zero failures or skips.
- Jog streamer, jog limits and grblHAL suites: 85 passed across six suites.
- The two new drain-transition tests failed before the timer/receipt correction and passed afterward. The finite Y step totals 0.5 mm without resuming the previous X jog.
- `git diff --check` passes.

The synthetic input-coalescing test reduces committed viewBox writes from 183 to
2 for the same gesture sequence and final camera. This is not a tablet FPS result:
real gestures also trigger periodic commits and worker refreshes. No sustained
30 fps claim is made. Physical SD uploads, held-to-step jogging, and pan/zoom on
K90, K50 and Lenovo remain physical checks for Build 67; Lenovo launch verification is recorded in its build note.
