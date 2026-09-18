# Build 40

Version: `1.6.4-android.40-node24-prototype`.

- Keep Status, Unlock and E-STOP inside a single 56px pendant header in both orientations. Remove the full-height spacer and prevent runtime knob UI from wrapping the header.
- Reserve enough landscape height for all four DRO rows and the Home, Go to XY and Zero All action row. Size square jog buttons and the circular pad using the remaining measured space, including Android system bars and the expanded Status strip.
- On shorter landscape windows, widen the control column to 416px and place Z and A side by side. On still shorter windows, use a 500px column with the preset buttons beside the jog controls. Extra width comes from the visualizer. Portrait retains its approved arrangement.
- Move CNC knob to the bottom tray immediately after Console. Its connection, QR pairing and mode controls open inside the tray with matching light/dark formatting. The frame is retained between tabs and stops display polling while hidden; automatic connection presence/reconnect remains active independently.
- Hide the XY pad touch/session status text while retaining the feed-rate readout and accessible status announcements.
- Retain the standard interface's knob launcher, existing controller behavior, jog hold/release handling, haptics, XY rim steps and center dragging. No firmware change is required.

Verification is against the packaged HTML (including its injected launcher) using a simulated CNC. Physical tablet/machine behavior remains for the user to confirm. This build is delivered for USB installation without installing automatically or commanding a physical CNC.

## Verification

- Main and pendant production bundles, release APK assembly and Android lint passed (0 errors; 9 existing warnings).
- All 262 Android-port/USB regression tests passed, including new checks for pendant launcher isolation and knob tray visibility/lifetime. Finished-APK simulated jogging/knob handover also passed.
- Packaged-interface checks at 1280×600, 1280×686, 1280×740 and 800×1249 confirmed header hit areas, all DRO rows/actions within their container, square jog controls and a circular XY pad. Expanded Status was checked at the shorter landscape sizes. CNC knob opens in the tray beside Console and survives tab switching.
- The final XY status span is visually hidden; the feed-rate readout remains visible.
- APK verification confirms versionCode 40, both UI build badges, Node 24.21.0/armeabi-v7a, the expected signing certificate, a non-debuggable release and no preview bootstrap in the payload.
