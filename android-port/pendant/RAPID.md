# Adaptive knob jogging — Build 24, Precision to Rapid

Exact STEP remains the default. Select **Adaptive: Precision → Rapid** in the
USB knob dialog for speed-sensitive operation. Changing mode or either saved
feed setting disarms; an explicit arm request is required afterward.

## Operation

- Isolated detents retain the knob's selected exact STEP at the saved Precision
  feed. Rapid is read separately from `widgets.axes.jog.rapid.feedrate`, in mm/min.
  The Rapid preset's XY/Z distances are not used.
- Three same-axis/direction turns with measured positive intervals no greater
  than 120 ms qualify for fast operation. Zero-interval reports can occur when
  UART events arrive in the same ESP tick: they neither establish infinite speed
  nor reset an already measured speed. An all-zero burst alone cannot qualify.
- The filtered period uses 35% of each new positive source interval. A smoothstep
  curve blends from Precision at 120 ms per detent toward Rapid at 25 ms per
  detent. Feed changes are additionally slew-limited by the axis acceleration
  and a one-second full-scale feed ramp. USB arrival intervals are not used.
- The continuous path is capped by the saved Rapid feed and selected axis
  maximum. If Rapid is lower than Precision, the continuous path obeys that lower
  ceiling. A missing Rapid setting prevents Adaptive arming, not Exact STEP use.
- Same-direction transition takes ownership of an already-issued STEP, including
  its target and ACK, without cancelling/re-sending it. Unsent detents are dropped.
  A long inherited STEP can therefore remain at Precision until enough of it has
  completed to append a short faster segment; its full distance is never added a
  second time. An opposite-direction STEP cannot be inherited.
- Fast travel is not STEP multiplied by detents. STEP 0 inhibits motion. Release,
  reversal, axis selection and STEP changes cancel fast operation. Cancellation
  requires drained receipts and two spaced fresh Idle reports. A reversal or
  selection change requires fresh input after the barrier; queued turns do not
  replay. Cancelling fast operation also cancels any remaining inherited STEP.

## Limits and failure behavior

New fast segments are finite 60 ms nominal `$J=G21G91` moves. At most one command
may be unacknowledged, at most three segments unfinished, and new segments cannot
increase outstanding nominal travel beyond 120 ms at their requested feeds.
Only confirmed position frees capacity, not elapsed time. An inherited slow STEP
was already authorized as an exact move and can exceed that budget by itself;
no new motion is appended until it falls within the budget. Its original endpoint
timeout and ACK tracking are retained.

Wheel intent expires after 180 ms minus reported source age. Duplicates cannot
extend it; motion tickets must be less than 100 ms old. UI/USB leases, native
250 ms write deadlines, firmware capability checks, and same-transport cancellation
uncertainty remain in force. Changing either feed while armed disarms instead of
silently accelerating. Malformed/missing data, off-path motion, ACK loss and
uncertain cancellation fail closed without automatic replay or re-arm.

Precision validation remains 1–1000 mm/min and STEP 0–10 mm. The Rapid input has a
numeric validation range of 1–100000 mm/min but is always capped by the selected
axis maximum; this validation range is not a recommendation for a machine speed.
The UI requires gSender display units to be mm and known fresh XYZ/$13 reports.

**Software bounds are not physical stopping-time or stopping-distance guarantees.**
Increasing Rapid increases potential stopping distance even with the same queue
duration. Machine acceleration, telemetry resolution, and transport latency
matter. Begin hardware testing with a small STEP, conservative Rapid, clear travel
and an accessible hardware stop. No indefinite `jog:start` or job feeder backlog
is used. See the [Grbl jogging implementation notes](https://github.com/gnea/grbl/blob/master/doc/markdown/jogging.md).

## Firmware and compatibility

No new ESP flash or knob graphics upload is needed for this Android change if
the Build 23 matching ESP firmware is already installed:

- ESP build: `20260915T143449507095Z-uart-enabled`
- Application SHA-256: `027f25dcafa0ffc1aa1c2cb994987cef6774f329cb33fc3df54c0e6101a0959e`
- Existing installer: HID Knob project's `tools/flash_esp32c6_adaptive.py`

The opt-in P2 VCAP/WHEEL extension and complete-frame display remain unchanged.
Old P2 firmware supports Exact STEP but cannot arm Adaptive. Build 23 remains the
fallback Android release, with its previous Precision-capped Adaptive behavior.

## Verification

The integrated Build 24 passes all 98 Android regression tests, including 61
pendant/preset tests and a rebuilt-backend integration test using the actual
upstream gSender controller and two simulated USB endpoints. Release assemble/lint
and APK payload/native-library verification also passed. Coverage includes saved Rapid capture, Precision-only steps,
speed ramping/caps, zero-period bursts, handoff without cancellation or duplicate
ACK ownership, release/reversal, old-input rejection, bounded outstanding travel,
transport failure, and no late replay. Build 23 cancellation/low-feed regressions
remain covered. Integration review also added a regression for settings validation
failing during STEP handoff: the inherited command is adopted before validation,
so fault handling still cancels it and retains its outstanding receipt.

The integration simulator completes finite jog endpoints immediately. It does
not model machine acceleration/inertia or Android USB hardware timing. No physical
CNC movement, app installation, or firmware flashing was performed for this
build. Physical validation of the reported fast-turning issue remains outstanding.
