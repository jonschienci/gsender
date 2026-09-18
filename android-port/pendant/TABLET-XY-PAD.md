# Tablet XY touch pad (Build 38)

The Android normal and pendant jog panels have an **XY controls** switch:
**Jog buttons** (default) or **XY touch pad**. The selection persists locally.
The pad replaces only XY; Z and rotary controls remain available. The pad itself
is disabled in rotary mode. It does not require the external USB/Wi-Fi knob.

Touch the center, then drag while holding. Right/left request X+/X−; up/down
request Y+/Y−. A 6% radial dead zone gives zero motion. Outside it a smoothstep
curve maps distance to 0–100% of the saved Rapid feed. Diagonal motion is
normalized, so it cannot exceed that total feed. X/Y board maximum feed and
acceleration settings further constrain motion. Commands use millimetres;
imperial display affects only the visible feed readout. Rapid edits or unit
changes end the current contact.

One active touch owns jogging. Starting it disarms the physical knob. Release,
drag-out, lost capture, another touch, keyboard/focus changes, app background,
view/mode changes, CNC faults, other gSender controls and lost CNC communication
end the contact. Reversing across the current direction or returning to center
cancels queued motion, then requires confirmed Idle and drained cancellation
receipts before a new direction can proceed. A released contact, native
background event or CNC fault cannot restart the previous contact.

The authenticated localhost API uses one session token and a single-use 250 ms
challenge for each input update. The frontend sends held-contact updates every
40 ms, with at most one request outstanding, and immediately after begin or a
resynchronization response. The backend cancels queued motion after 250 ms
without fresh input but preserves the finger contact for up to 2 seconds. A late
update within that window is discarded and answered with a new challenge;
it never applies its old movement. Only a fresh response sampled from the
still-held finger can resume, after cancellation receipts and a fresh Idle
report. Longer absence, replayed challenges and invalid vectors end the contact.
Release/background still end it immediately; late HTTP replies cannot revive it.
Native foreground events are observed even when
no Wi-Fi knob has been connected. The backend emits finite XY `$J=G21G91` segments
through the existing bounded serial write path. Build 36's acceleration-aware
180–500 ms nominal queue (at most nine segments) is retained. It requires ACK and
position evidence to reclaim capacity, and never
replays commands. Those software horizons are not measured physical stop times;
the controller applies its actual acceleration and braking.

Validation uses simulated controllers and real React pointer events. It covers
speed curves, diagonals, axis limits, changing direction, center/release stops,
queue bounds, lost/stale/duplicate input, late begin responses, capture loss,
background/multitouch/unmount, native pause, and conflicts with other controls.
Both frontend variants and the backend are included in Build 31. No physical
CNC motion was commanded during development; physical feel/latency remains to
be checked on the tablet.

## Build 31: idle detection and mode switch

The XY controls selector is now a two-position switch: **Jog buttons** when off,
**XY pad** when on. Both layouts retain the same saved preference and cancel
jogging when switching modes. Z and rotary controls are unchanged.

Fixed the pad staying at “Waiting for idle CNC”: its status route issued a USB
status query before checking for an empty USB write queue, so the route counted
its own asynchronous query as a busy connection. Readiness is now sampled
before sending that read-only request. Beginning a touch still independently
checks the live controller and all existing motion interlocks. Unavailable
states show a specific reason (connection, fresh data, alarm, queued commands
or pending cancellation).

A packaged-backend regression reproduces the stuck state with the exact Build30
APK and simulated asynchronous USB, then verifies Build31 reaches ready, accepts
finite diagonal XY input, cancels on release, and needs no physical knob. UI
tests cover the actual switch and touch cancellation. Physical tablet jogging
remains to be tested.

## Build 38: Precise rim taps

The enlarged pad has an intrinsic square canvas and circular rim, preserving its shape in both orientations. Tap and release in one of the eight outer sectors for exactly one finite step using the saved Precise XY distance/feed. The rim uses the same normal jog utilities and unit conversion as the regular buttons. Holding does not repeat. Movement beyond tap tolerance, another sector, leaving the rim, cancellation, another touch or lifecycle/mode changes suppress the pending step.

Center-started drags retain the existing continuous pad session. Dragging over the rim and releasing never creates an additional tap. The visible center marker is larger. Z/A controls stay available beside the enlarged XY control.

## Build 39: pendant placement

In pendant view the unlabeled switch at the jog card's upper-left selects regular jog buttons when off and the XY pad when on. Its accessible name remains **XY touch pad**. The standard interface keeps the text labels. Changing modes still cancels jogging and saves the preference.

The pendant controls sit beside the DRO in portrait and below it in landscape, with square jog buttons, a circular pad, and additional spacing around controls. Precise rim taps and continuous center dragging retain Build 38's behavior.
