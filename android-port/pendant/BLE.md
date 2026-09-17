> Build 37 connects directly to the QR-identified knob without Bluetooth discovery or location access. Android 8–11 need no runtime Bluetooth/location permission; Android 12+ request only Bluetooth CONNECT (Nearby devices). Location services can stay off. Build 32 supersedes the manual arming flow below; see [INPUT-v1 and automatic readiness](INPUT.md). The Bluetooth cryptographic contract is unchanged.

# Build 30: USB first, Bluetooth knob fallback

The CNC controller remains on USB. The knob dialog offers USB (default) or
Bluetooth. Select Bluetooth, open **PAIR BT QR** on matching knob firmware,
then tap **Scan knob QR**. Android requests camera and Bluetooth discovery
permissions if needed (discovery permissions were removed in Build 37). After granting permissions, tap Scan again. A valid scan
pairs and connects automatically; no address, pairing confirmation, or probe
buttons are required. The first Arm is explicit. Pairing is held only in this
app process: scan again after restarting gSender. No Android OS Bluetooth bond
or PIN entry is used; the QR key authenticates the application connection.

Transient link loss stops owned jogging and discards pending input. Automatic
reconnection uses the same identity/key and bounded backoff while gSender is
visible. The previous armed setting is restored only after the existing
[recovery checks](RECONNECT.md): same boot/page/settings/CNC/UI, cancellation
receipts, fresh status, and continuously released controls for at least 300 ms.
Old input is never replayed. Manual disarm/disconnect, backgrounding, changes to
controls/settings, alarms, authentication/protocol faults, or uncertain
cancellation revoke that armed setting. Normal USB behavior and the selectable
tablet XY pad are retained. Legacy Wi-Fi code/API/tests remain for rollback;
Wi-Fi is no longer offered in the normal connection selector.

## Wire contract

- QR: exactly `GSB1:<12 uppercase identity hex>:000.000.000.000:<64 uppercase key hex>`.
  The address field is a fixed literal. Zero keys and alternate formats are rejected.
- Service: `3c8f0001-6b27-4f91-8e42-7dd34b62a901`; response-write RX uses
  `0002` and notify TX uses `0003` with the same UUID suffix. Standard CCCD.
- Build 37 derives the public Bluetooth MAC from GSB1's Wi-Fi STA/base identity
  using the shipped ESP32-C6 firmware's four-universal-MAC configuration:
  add 2 to the last byte, with 8-bit wrap and no carry into the prefix.
  It calls `getRemoteDevice(...).connectGatt(...)` directly, without scanning.
  This mapping is specific to that firmware contract, not arbitrary BLE devices;
  a future custom/random-address firmware needs an explicit address in its QR.
  No firmware update or Android OS bond is required for the existing knob.
  Service/RX/TX/MTU are still checked. The address only selects a peer; the
  QR identity/key authentication below still determines whether it is trusted.
- Client: `01 || C32`. Server: `02 || S32 || HMAC-SHA256(PSK,
  "GSK-BLE1-SERVER\0" || identity6 || C32 || S32)`. Client proof: `03 ||
  HMAC-SHA256(PSK, "GSK-BLE1-CLIENT\0" || identity6 || C32 || S32)`.
- HKDF-SHA256: IKM=PSK, salt=SHA256(C32||S32), info=`"GSK-BLE1-KEYS\0" ||
  identity6`, length80. Output: client key32, server key32, client nonce prefix8,
  server nonce prefix8. AES-256-GCM authenticates every P2 line.
- Packet: direction byte (`10` client / `11` server), uint32 big-endian sequence,
  ciphertext, tag16. Header is AAD; nonce is direction prefix8 plus sequence4.
  Each direction starts at zero and must advance exactly; no wrap/replay.
- One printable ASCII P2 line ending in LF per packet, maximum192 plaintext /213
  packet bytes. Request MTU247 and accept negotiated values >=247, including517.
  Only write-with-response; one outstanding write, no motion retransmission.
- GATT setup bounded14s; authentication5s once ready; authenticated HELLO8s.
  Firmware covers the QR before HELLO. Initial disarmed STATE/HELLO grace is8s;
  the established P2 heartbeat lease is250ms. Existing PAD_R/VPAD_R and NCAP
  semantics are unchanged.
- Native event/write queues expire at50ms; response writes at100ms. JNI reports
  monotonic queue age to Node so a stalled event loop cannot make old packets
  fresh. All generations, keys and ownership are discarded on close.

Native Android handles GATT and ciphertext only. Node's bundled OpenSSL provides
HMAC/HKDF/AES; no additional crypto or Bluetooth dependency is introduced. BLE
keys are independent of the retained Wi-Fi rollback key on the ESP.

## Validation and limits

`test/ble-public-vectors.json` contains only public synthetic secrets, generated
independently with Python cryptography and checked against the ESP C implementation.
Node verifies the same exact handshake, derived key and encrypted packet bytes.
Tests also cover tampering, direction/sequence/replay, bounds/deadlines, early
notifications, foreground loss, automatic recovery and held controls. A packaged
backend test uses actual encryption and a simulated native GATT/USB CNC to verify
finite jogging, cancellation, neutral recovery and rejection. No hardware is
controlled by these tests. Android assemble/lint and APK integrity/signing checks
are required before delivery. Actual camera/radio timing, permissions and physical
motion remain unvalidated on the tablet/knob pair.

Platform references: [Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions),
[GATT API and Android 14 MTU behavior](https://developer.android.com/reference/android/bluetooth/BluetoothGatt).
