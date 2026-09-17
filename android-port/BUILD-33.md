# Build 33

Version: `1.6.4-android.33-node24-prototype`. App title and APK filename include Build 33.

- Core: gSender v1.6.4, `eb2df2d2073d9dd1a762c0ed150d9be19360cf49`.
- Jogging/joystick and pendant: dev `a45b81aeca15b6d138fcc21105fbcf55aad5315a`.
- This is a scoped hybrid. Dev plugin support and unrelated dev features are not included. `upstream.json` records source hashes and overlay paths.
- Bluetooth authentication silence can retry with the saved QR identity. Invalid authentication and ciphertext replay still stop retries. A healthy ESP reboot closes the old connection and creates fresh crypto/P2 sessions; automatic readiness requires new neutral evidence, valid idle CNC status, and resolved old motion receipts. Old motion is never replayed.
- The dev jog streamer supplies normal continuous jog/joystick movement. Android knob and XY pad keep their finite, freshness-bounded movement path. Starting a dev stream while an old knob/XY move is still stopping is rejected; release and press again after it has stopped.
- Physical knob H reports retain their 250ms freshness bound. No stationary contact is invented from a heartbeat. Actual hardware hold reporting remains unverified.

Validation: 233/233 Android tests; 58/58 scoped upstream jogging tests; both UI bundles; release build and lint; APK ABI/runtime/payload/signature verification. Tests use simulated USB/GATT, including encrypted reboot, >5s auth silence, distinct new crypto/P2 sessions, invalid-proof/replay rejection, raw 0x85 jog stop, socket-loss cancellation and no replay. Browser preview verified standard/pendant startup, native gSender pendant setting, XY switch and synthetic G-code parsing/visualization. No device install, firmware flash or physical CNC movement performed.

Optional matching radial knob update is owned by the HID Knob project: `tools/flash_esp32c6_radial.py`, then `tools/upload_radial_pages_via_esp.py`; instructions and rollback in that project's `docs/RADIAL-JOG.md`. ESP run `20260917T143620268497Z-ble-uart-enabled`, firmware SHA-256 `d2bd7b1c47441c7421d9cd82b80cca38f836f9c90b7ea6c2f537bdd1aa432283`; graphics SHA-256 `3f1e34f71e8f590650148e0f3140771ddfa297544ee22a5b6a2250af4bf1fed8`. This app remains compatible with the Build 32 knob layout. Neither installer was run by this task.
