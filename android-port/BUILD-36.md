# Build 36

Version: `1.6.4-android.36-node24-prototype`.

The tablet XY pad now sizes its short movement queue using requested speed and
the configured X/Y accelerations, following the braking-distance approach in
the pinned dev JogStreamer. The previous fixed 120 ms limit could repeatedly
make the controller slow toward the end of its queue. The new nominal queue
budget ranges from 180 to 500 ms and includes a margin for position reporting
and replenishment. There are at most nine finite 60 ms segments, with at most
one unacknowledged write. Position evidence is still required to refill it;
elapsed time alone never retires a queued move.

Release, center, reversal, contact expiry, stale CNC status and other stop
conditions continue to issue jog cancellation. The 200 ms contact lease,
150 ms input challenge, bounded USB writes, ACK/progress timeouts and machine
limits remain in place. A larger queue can increase response time to a curved
direction change; release and reversal cancel the queue instead of waiting for
it to finish. The 500 ms cap can still limit speed on machines with very low
acceleration. No controller settings are changed.

The recorded Build 35 machine test sustained both regular jogging and a long
XY gesture; the operator reported XY stutter. Build 36 changes only XY backend
scheduling and the version number. Both frontend bundles, regular jog behavior,
haptics, USB runtime and upstream source pins are unchanged. No knob firmware
update is needed.

Validation:

- 253/253 Android regression tests, including release/reversal/expiry/stale
  position with a full queue and a stationary controller that must not receive
  unbounded movement.
- A deterministic acceleration/braking simulation with independent ACKs and
  50–60 ms position reports reproduces uneven speed with Build 35. At requested
  feeds of 1200, 3000 and 5000 mm/min with 100 mm/s² acceleration, Build 36's
  steady-state mean is at least 98% of the requested feed and its minimum is
  at least 94%. These are model results, not measurements from the user's CNC.
- Finished-APK simulated USB backend test, release assembly, lint, payload,
  Node 24.21.0 runtime, ARM ABI, version and existing signing certificate checks.
- Both interfaces' 61 asset files are byte-identical to Build 35; only their
  HTML build labels change from 35 to 36.

Build 36 has not yet been tested on the physical machine or installed by the
build process. Further machine confirmation of XY smoothness is required.

References: the pinned `src/server/lib/JogStreamer.js` and
[Grbl's joystick implementation notes](https://github.com/gnea/grbl/blob/master/doc/markdown/jogging.md#joystick-implementation).
