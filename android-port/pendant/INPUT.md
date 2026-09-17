# Build 32: responsive knob input and automatic readiness

The normal USB/Bluetooth knob flow has no Arm/Disarm buttons. Connect USB or
scan the Bluetooth QR, release the knob controls briefly, and wait for Ready.
The backend requires the new INPUT-capable firmware, visible gSender, fresh CNC
position/units, an idle controller with empty queues, valid Precision/Rapid
presets in mm, known axis limits, and at least 300 ms of fresh neutral evidence.
Existing tablet XY-pad readiness and the Jog buttons / XY pad switch remain.

Adaptive Precision → Rapid is the default. Isolated turns retain exact STEP;
a measured rapid burst can enter the existing bounded velocity path immediately.
Exact STEP remains selectable, with an eight-turn queue and expiring input;
overflow is discarded rather than combined into a larger move. Adaptive motion
retains finite 60 ms segments, a 120 ms nominal planner budget, axis/feed limits,
ACK and actual-position checks. No receipt or old motion is replayed.

Changing page, axis, STEP, mode, settings, UI session, CNC connection or control
owner pauses motion and requires fresh release evidence. Backgrounding, stale
input, jobs, alarms and uncertain cancellation block readiness. Wireless loss
cancels owned motion, reconnects with bounded backoff, and waits for a new
session's neutral/CNC evidence. Disconnect stops retries. Legacy firmware stays
display-only in the new flow; retained manual APIs exist for rollback tests only.
The settings dialog opens only from its launcher, never from readiness changes.

## Matched firmware

ESP INPUT-v1 build `20260917T135928827448Z-ble-uart-enabled`:
SHA256 `18ade3ece33bc6a5632c97be636944414e2d14ea7dda916d24b0f04fcab908eb`.
The HID Knob project's installer is `tools/flash_esp32c6_input_v1.py`.
Existing Build 30 Bluetooth graphics are unchanged. Firmware installation is a
separate action; building this APK does not flash or operate hardware.

## Compact protocol

New STATE labels are `BPAD_R_READY/ARMED` for Exact STEP and
`BVPAD_R_READY/ARMED` for Adaptive. Both USB and BLE opt into exactly 19 tokens:

```
P2 INPUT boot session sampleSeq ticket context ready fault selection stepUm page epoch neutral positiveTotal negativeTotal direction periodMs ageMs
```

INPUT replaces ALIVE/PCAP/NCAP/VCAP/WHEEL/DETENT bursts. Physical XY touches still
use PAD. Firmware emits at most 50 Hz while active and 25 Hz idle. If Bluetooth is busy,
it waits until the sender drains before constructing the latest snapshot; it
does not queue a backlog of old input. Snapshot
sequence advances once per emitted frame, never per detent. Counters are
monotonic within a context, capped at INT32_MAX; their combined delta is at most
64. New contexts begin with zero counters/direction. Mixed-direction batches
are discarded and pause motion. Burst speed must have a finite positive source
period. Repeated counters never extend a motion deadline.

Every frame is bound to boot/session/ticket/context. A new context revokes old
motion tickets and is acknowledged immediately. The host preserves its own
expected rising-enable context so readiness cannot oscillate indefinitely.
Ticket freshness remains 100 ms, input lease 250 ms, native/JNI queue age 50 ms,
and BLE write deadline 100 ms. Authentication/encryption and key handling are
unchanged; the maximum INPUT line fits the existing 192-byte plaintext limit.

## Verification

`test/esp-input-v1-public-fixture.json` is emitted by the actual compiled ESP C
code using public mock identity/session values. Tests exercise that transcript,
batched turns, monotonic counters, stale/replayed samples, neutral readiness,
context changes, reconnection, exact/adaptive motion bounds, and both UI modes.
The packaged backend test uses real authentication/encryption over simulated
Android GATT and USB CNC. These checks do not establish physical radio latency
or machine behavior; tablet/knob validation remains necessary.
