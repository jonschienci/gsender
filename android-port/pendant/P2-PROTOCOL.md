# USB pendant P2 (Android Build 12)

ASCII newline frames, 256-byte maximum; 115200 8N1 native ESP USB. No network
link to ESP, no new CNC serial-port owner. Paired ESP source is in HID Knob.
Old P1 and B1 are rejected. P1 Mac bridge/recovery binaries remain separate.

```
ESP → host: P2 HELLO <boot16hex> 2 <ready01> <fault01>
host → ESP: P2 STATE <session32hex> <ticket> <valid01> <armed01> <x_um> <y_um> <z_um> <STATUS> <approved_step_um>
ESP → host: P2 ALIVE <boot> <session> <ticket> <ready01> <fault01> <selection> <step_um>
ESP → host: P2 DETENT <boot> <session> <sequence> <ticket> <X|Y|Z> <-1|1> <step_um>
host → ESP: P2 STATUS
host → ESP: P2 DISARM
```

- Selection 0/1/2/3 = X/Y/Z/STEP. Touch selects; rotating STEP edits locally.
  No SELECT/STEP-change motion packets. ALIVE coalesces current settings at
  100 ms intervals. Default 500 µm, range 0–10000 µm, grid 100 µm, RAM only.
- Host echoes the last reported step in STATE; it does not overwrite the
  local editor. ESP suppresses motion events until its setting matches the
  acknowledged value, and whenever STEP is selected or the distance is zero.
- DETENT captures distance and axis at input time. Host requires the distance
  to equal both the referenced armed ticket and its current acknowledged STEP.
  Older distances are discarded, never reinterpreted at a newer larger step.
- Tickets and sequence: integers 1..2147483647; no wrapping, retry or replay.
  Duplicate sequence ignored; sequence gaps/invalid sessions fail closed.
  A discarded valid turn still consumes its sequence. Tickets expire after
  500 ms; a short retained history distinguishes delayed/revoked traffic from
  future/unissued tickets. Late ALIVE cannot renew health.
- ESP ready/fault and fresh host lease gate events. Host additionally requires
  explicit arming, fresh visible-UI heartbeat, valid CNC position/report units,
  idle workflow, empty feeder, bounded transport and expected machine state.
  Settings edits alone do not arm or disarm. Other UI/config/transport faults
  still disarm; no automatic reconnect/re-arm.
- Local motion queue ≤8 entries, 200 ms expiry; saturation increments a drop
  counter rather than throwing a transport error. Changed selection/step or
  queued direction drops unsent previous intent. One finite move in flight,
  never resend; complete only after ok + fresh Idle + endpoint. Timeout is
  max(1500 ms, distance*60000/feedrate + 1500 ms). Cancellation best effort.
- gSender's saved Precision feed is retained (1..1000 mm/min). Its on-screen
  jog steps are not changed; the knob uses its own STEP for every axis.

Display: all XYZ plus STEP on every frame, 466×466, preferred CA000005 font;
full composition and final display-on preserve the proven double-buffer order.

Tests use fake USB devices only. `usb-pendant.test.cjs` covers burst saturation,
settings synchronization, zero/bounds, stale input, finite movement and faults.
`usb-pendant-backend.test.cjs` tests the packaged backend with the actual gSender
controller and two simulated USB endpoints. Never point those tests at hardware.
