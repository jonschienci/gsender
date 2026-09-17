# Build 27: physical-knob page navigation and XY touch jogging

Pairs with the ESP three-page release in the HID Knob project. Push-button clicks
cycle DRO, XY JOG, WI-FI. Page changes stop/disarm owned motion, clear old tickets,
and require explicit re-arming. Wi-Fi information/QR pairing no longer occupy the
DRO footer. Z encoder control on the jog page cannot mix with active touch XY.

The app opts into `PCAP` / `PAD` using PAD_READY/PAD_ARMED (or VPAD for adaptive
encoder behavior). STATE adds the accepted page and monotonically increasing
page generation after the first capability report. Old helper traffic cannot
arm the new jog page. Pairing and maintenance still exclude motion ownership.

Short taps send one knob STEP on each selected XY axis at Precision feed. A
200 ms hold requests normalized XY vector segments, capped by axis feed limits.
Finite segments use the existing bounded CNC USB writes; the strict allowlist now
also permits ordered XY diagonals, not XYZ, duplicate axes or multiple lines.
The packaged serial write transform emits jog cancel as the exact raw byte 0x85.

Continuous input is conditional on fresh physical touch-contact reports: at least
two source reports and ongoing contact with gaps below 250 ms. No new report is
synthesized from a latched press. Releases, drag-out, stale source reports, link/UI
loss and page changes cancel. Motion has at most 120 ms nominal queued travel,
ACK/progress checks and a three-segment cap, not a guaranteed physical stop time.

**Hardware gate:** the manufacturer's manual does not guarantee the required
contact reporting cadence. Pages, timing, tap and hold behavior must be tested
on the actual knob; edge-only reporting will refuse/stop hold motion. The HID
project's `tools/trace_knob_touch.py` records 30 seconds of input while the CNC is
disconnected. Do not extend the lease to simulate a held finger.

The main/pendant gSender frontend and Node runtime remain byte-identical to Build
26. Build 27 changes the helper/backend and its panel; no new Android permission
or app signature is introduced. Desktop Mac helper behavior is not upgraded here.
