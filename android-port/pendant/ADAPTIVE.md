# Adaptive knob jogging — Build 23

Build 23 keeps Exact STEP as the default and adds **Adaptive** in the USB knob dialog. Changing mode disarms. An explicit arm request requires a fresh firmware capability handshake, an idle CNC, the saved Precision preset, and all XYZ maximum-feed/acceleration settings. The installed app is named **gSender Android Build 23**; its label follows the version code automatically in future builds.

## Operation

- Isolated slow turns retain the selected exact STEP. Three fresh same-axis, same-direction turns with positive source intervals no greater than 120 ms enter fast motion.
- Fast motion uses finite 60 ms nominal segments with variable feed, capped by Precision and the selected axis maximum. Feed changes are smoothed using the axis acceleration setting. Fast distance is not STEP multiplied by detents; entering fast motion may cancel an unfinished exact step.
- STEP 0 prevents motion. Release, reversal, axis selection, and STEP changes cancel the fast stream. Cancellation requires drained owned receipts and two distinct, spaced Idle reports. Reversal/selection require fresh input after this barrier; stored turns are not replayed.
- Fast mode permits at most one unacknowledged segment, three unfinished segments, and 120 ms nominal outstanding travel at the requested feeds. Position confirmation frees capacity; wall-clock time alone does not.
- New wheel intent expires after 180 ms minus its reported source age. Repeats cannot extend it; motion tickets must be less than 100 ms old. UI/USB leases and the existing 250 ms native write deadline remain active. Unexpected motion, stale status, missing receipts, or uncertain cancellation disarm without automatic replay or re-arm.

These are software bounds, not guaranteed physical stopping times. Slow exact steps can still travel the selected distance, up to 10 mm. USB latency, telemetry resolution, machine acceleration, and controller planning affect the result. Simulator tests do not measure physical smoothness or stopping distance.

## Matching firmware

The corresponding ESP32-C6 build is `20260915T143449507095Z-uart-enabled`, application SHA-256 `027f25dcafa0ffc1aa1c2cb994987cef6774f329cb33fc3df54c0e6101a0959e`. The companion HID Knob project provides `tools/flash_esp32c6_adaptive.py` and `docs/ADAPTIVE-JOGGING.md` with installation and fallback instructions. This Android build does not flash the knob or change its display graphics.

Old P2 firmware continues to work in Exact STEP. It cannot arm Adaptive. The updated firmware also remains compatible with old Android builds in Exact STEP.

## P2 extension

The existing HELLO and DETENT formats are unchanged. The host opts in using STATE labels `VEL_READY` or `VEL_ARMED`; the firmware displays them as ADAPT_READY/ADAPT_ARMED. The extension is:

```text
P2 VCAP <boot> <session> <ticket> 1
P2 WHEEL <boot> <session> <seq> <ticket> <axis> <direction> <period_ms> <age_ms> <step_um>
```

Axis is X/Y/Z/S; direction is -1/0/1. Period is 0–65535 ms, age 0–10000 ms. Sequence is shared with legacy DETENT. A new source detent advances sequence; repeated reports retain sequence and increase age. A zero interval cannot qualify as sustained fast turning. VCAP accompanies ALIVE every 100 ms and expires at 500 ms; WHEEL repeats every 40 ms. Adaptive host STATE cadence is 40 ms. Source intervals are measured at ESP UART receipt, not inferred from Android USB packet arrival.

## Integration review

The isolated handoff was based on Build 21 and was integrated onto Build 22, preserving its stable SVG options, incremental line counting, hidden-panel polling behavior, logging reductions, optimized release build, and 768 MiB Node old-generation limit.

Review added regressions and fixes for a queued slow-step reversal replaying after cancellation, fast feed exceeding an axis limit below 1 mm/min, and a knob-only reconnect clearing uncertain cancellation on the same CNC transport. An uncertain transport must remain blocked until receipts are resolved or the board transport is replaced.

All 90 Android regression tests passed (including 53 pendant tests), along with release assemble/lint and APK payload/native-library verification. Tests exercise the real packaged gSender backend with simulated CNC/ESP endpoints as well as unit-level timing, cancellation, bounded motion, and compatibility cases. The endpoint simulator completes finite jogs immediately; it does not model acceleration or inertia. No physical CNC motion, APK installation, or firmware flashing was performed for this build.
