# Build 26: private QR pairing on the knob

> Build 30 uses Bluetooth in the normal selector; see [current Bluetooth operation](BLE.md). Legacy Wi-Fi behavior below remains in the rollback code.

> Historical behavior for the original build. Build 29 simplifies scan/connection and adds guarded reconnection; see [current behavior](RECONNECT.md).

USB remains the default; this changes only Wi-Fi pairing. No ESP or knob flashing occurs in the Android app.

1. Disconnect the knob in gSender and select Wi-Fi fallback. On the knob, tap **PAIR WIFI** (available when offline with an IP address).
2. Tap **Scan knob QR** inside gSender. Grant camera permission if requested, then tap Scan again. The permission callback never launches the camera automatically.
3. Keep the entire white QR square visible to the rear camera. The native scanner decodes locally with ZXing core 3.5.3; there is no external scanning app, WebView camera grant, file, cloud service, or URL navigation from scanned content.
4. Confirm the displayed device identity and IPv4 address. Only this explicit confirmation saves the pairing for the current app process. No key is displayed/logged/copied to the clipboard.
5. **Tap the knob to close its QR before Test Wi-Fi link or Connect.** The ESP blocks host connections while the QR is visible. Test while disarmed; connection and arming still require separate actions.

The scanner closes on cancellation, app background, rotation, main-page navigation, backend-session change, connection/transport change, or timeout. Camera frames are decoded in a bounded worker and discarded, never saved. The native window blocks screenshots/task previews while scanning and confirming. The backend holds a single 90-second scan reservation, rejecting connect/arm while it exists; native scanning expires at 60 seconds. A late asynchronous result cannot reopen UI or apply a newer session's pairing. Scanning an unrelated QR does nothing.

Exact format: `GSK1:<12 uppercase MAC hex>:<canonical IPv4>:<64 uppercase key hex>` (maximum 98 ASCII characters). Both Java and Node parsers enforce the format; Node converts it into the existing version-1 JSON pairing, fixed port 58596. Host validity/current Wi-Fi/subnet and TLS-PSK authentication remain enforced by the existing Wi-Fi connection code. Paste JSON and optional IP override remain supported.

Target device: Lenovo TB8506F (Android minimum 26). Native Camera preview is used for compatibility with that device, with rear camera preference, autofocus when supported, fitted aspect ratio, a QR-only decoder and no Play Services dependency. Actual camera permissions, focus/glare/distance and the knob's native QR still need a physical tablet test. Host image-decode tests cannot establish real scan performance or CNC safety.

Decoder tries normal colors, then one inverted-color attempt if QR detection fails. Tests exercise the production decoder on 50 synthetic QR images: two payload lengths, multiple scales/rotations, both polarities, and a 4-pixel-module QR at (108,104) on a mock round 466×466 background. These are not photographs of the actual panel.

Dependency source: https://repo.maven.apache.org/maven2/com/google/zxing/core/3.5.3/core-3.5.3.jar
Upstream: https://github.com/zxing/zxing/tree/zxing-3.5.3 (Apache-2.0).
Pinned SHA256: `8d8064c1636fdaef7189dd9055c7d59950a8940a12f2293956446ec3c109fd82`.
Gradle verifies the decoder before building. License/NOTICE are included in app assets.

All test keys are synthetic. Do not add real QR text, pairing JSON, camera captures, or secrets to this repository or release artifacts.

Cancellation is checked before dispatch, again when the backend receives a complete confirmation request, and on return to the native UI. If the user already confirmed and the backend committed the pairing before cancellation arrived, that session-only pairing remains saved; cancellation does not roll back an already-completed confirmation. It never connects, arms or queues any CNC motion. A partially received confirmation that completes after scan cancellation is rejected.
