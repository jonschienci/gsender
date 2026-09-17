# Build 29: scan, connect, and recover Wi-Fi

> Build 30 uses Bluetooth in the normal selector; see [current Bluetooth operation](BLE.md). Legacy Wi-Fi behavior below remains in the rollback code.

This build retains Build 27's physical-knob control pages and adds automatic Wi-Fi
connection after a successful QR scan. The native scanner validates the QR,
saves pairing for this app process, closes the camera, and starts connecting.
There is no second pairing confirmation. The regular panel presents Scan,
Disconnect, Arm, and Disarm. Manual JSON/address fields, pairing/forget buttons,
and the link probe are removed entirely. Scan selects Wi-Fi automatically even
from the default USB selection; the CNC stays on USB.

Use the matching HID Knob ESP reconnect firmware. An authenticated TLS connection
closes its QR display and returns to DRO before sending HELLO. The Android app
waits up to 30 seconds for HELLO to accommodate the redraw; after HELLO the normal
250 ms heartbeat lease remains in force. Fresh ready=0 replies do not close the
link, even if a page redraw takes more than six seconds. Readiness still gates
all motion. Older firmware can connect after closing the QR manually.

## Temporary link loss

Wi-Fi connection attempts back off from 500 ms to a maximum five seconds, while
gSender remains visible and sends fresh UI heartbeats. Presence is independent
of jog configuration: missing/invalid presets or inch display no longer falsely
mark the UI inactive and block connections. Invalid/changed settings still
revoke arming, and becoming hidden immediately expires the UI lease. There is one pending
attempt. No USB fallback, network switching, stored motion, or command replay is
performed. Manual Disconnect, pairing changes, scanner entry, or transport
selection stop the old attempt. Restarting the app still requires scanning again.
Pairing credentials remain in memory only and do not appear in status or logs.

A successful explicit Arm can be retained as an *armed setting* across a temporary
Wi-Fi failure. Actual motion ownership and armed tickets are revoked on loss;
owned jogging is cancelled and queues are discarded. The panel says jogging is
paused while reconnecting. The CNC observer remains attached to consume pending
cancellation receipts and detect intervening commands. Reconnection restores the
armed setting only when all of these conditions hold:

- Same knob identity/key and boot, same page/epoch, axis selection and STEP.
- Same CNC controller and USB transport, unchanged CNC settings, idle workflow,
  fresh coordinates, empty feeder/transport, and completed cancellation receipts.
- Same visible UI session, Precision/Rapid presets, and motion mode.
- Fresh ALIVE and page capability; fresh velocity capability in Adaptive mode.
- Continuously fresh neutral-input proof for at least 300 ms in the new session.

New armed tickets are issued only after these checks. Pre-loss and disarmed
inputs cannot move the machine. Manual Disarm, backgrounding the app (including
between retry attempts), UI/control/page changes, alarms, firmware reboot,
protocol violations, changed settings, and uncertain cancellation revoke the
retained arm. Automatic reconnection may still proceed disarmed where appropriate.
The initial connection never arms by itself. With compatible firmware, the Arm button waits until the controls are released so the app does not claim arming before the knob will accept it.

## Neutral proof contract

Wi-Fi uses `PAD_R_READY` / `PAD_R_ARMED` or `VPAD_R_READY` /
`VPAD_R_ARMED` STATE labels. They retain the page/epoch suffix and opt into:

`P2 NCAP <boot> <session> <ticket> 1 <neutral:0|1>`

Only fresh, strictly advancing issued tickets renew this proof. A held-input
report or a lease-sized gap resets the neutral interval. The matching firmware
requires ready hardware, released physical/touch controls, a disarmed new session
at least 300 ms old, and no input activity for 300 ms; it also enforces neutral
on each rising armed request. Normal already-armed input is unaffected. Legacy
firmware without NCAP cannot restore arming automatically; manual Arm remains
available. USB retains its existing labels and manual reconnect behavior.

## Validation limits

Software tests cover automatic scan connection, real loopback TLS reconnection
against the packaged backend, cancelled jogging, stale-ticket rejection,
neutral/held-input gates, cancellation receipts, background events between
retries, CNC/UI/settings changes, and page rendering beyond six seconds.
The native scanner, Android foreground callbacks, real radio timing, full QR
handoff, and physical jogging must still be checked on the actual hardware.
Software deadlines and the diagnostic round trip are not physical stopping-time
guarantees. No tablet install, firmware flash, or machine motion occurs as part
of the build process.
