# Build 37

Version: `1.6.4-android.37-node24-prototype`.

The tablet XY pad now tolerates brief scheduling delays without discarding the
held finger. The input challenge/lease is 250 ms, replacing the previous 150 ms
challenge and 200 ms lease. When fresh input stops, queued motion is cancelled;
the finger session may remain available for up to two seconds. A delayed packet
within that window is discarded and receives a new single-use challenge. It
cannot apply its old direction. The UI samples the still-held contact again
immediately, and movement can resume only after the cancellation receipts and
a fresh Idle report. The marker stays with the finger during recovery.

Release, lost capture, backgrounding, other controls and CNC faults still end
the contact. Late responses cannot revive it. A two-second input absence ends
the session; that is not two seconds of permitted motion. Build 36's bounded,
acceleration-aware XY queue remains in place. Normal jog controls and haptics
are unchanged.

Bluetooth knob connections no longer use discovery or Location Services. GSB1
contains the ESP32-C6 Wi-Fi STA/base identity. The shipped firmware uses a public
Bluetooth address with four universal MACs; ESP-IDF derives it by adding two to
the last byte, modulo 256 without carry. Android now connects directly to that
address and verifies the same service, characteristics, MTU and authenticated
QR-key handshake. The address selects a peer; it is not an authentication check.
No knob firmware update or extra pairing button is needed for the current knob.

The APK declares no location permission, location feature, Bluetooth SCAN or
legacy Bluetooth ADMIN permission. Android 8–11 use the legacy install-time
Bluetooth permission; Android 12+ request Bluetooth CONNECT as Nearby devices.
The QR camera still needs camera permission. Location services can remain off.
Future knob firmware using a custom/random address or another MAC allocation
will need to encode its actual Bluetooth address in a versioned QR format.

The frontend build script now loads the Vite config natively, avoiding a CommonJS
`node:path` require failure in Vite's bundled config loader.

Validation:

- 257/257 regression tests, including delayed touch updates, recovery with a new
  direction, cancellation/Idle gating, duplicate challenges, hard contact loss,
  and release racing a recovery response in the real React component.
- Finished-APK simulated backend test exercises a held jog, standalone XY,
  input-stall cancellation, fresh-input recovery, release and knob handover.
- Both UI builds, Android release assembly and lint (zero errors), payload hash,
  Node 24.21.0 runtime, ARM ABI and the existing update-signing certificate pass.
- The actual APK's manifest has no location or Bluetooth scanning permission;
  both frontend bundles and the backend contain the new recovery code.
- The MAC mapping was checked against the local shipped ESP32-C6 build's
  sdkconfig and BLE source, plus its ESP-IDF implementation. Java tests cover
  identity validation and octet wrap. Authentication tests remain unchanged.

This APK has not been installed or tested on the physical tablet/knob/CNC pair
by the build process. Test XY holds and scan the knob QR again with Location
Services off after installing.

References: [Android GATT connection API](https://developer.android.com/reference/android/bluetooth/BluetoothDevice#connectGatt(android.content.Context,boolean,android.bluetooth.BluetoothGattCallback,int,int,android.os.Handler)),
[Bluetooth permissions](https://developer.android.com/develop/connectivity/bluetooth/bt-permissions),
[ESP32-C6 MAC allocation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32c6/api-reference/system/misc_system_api.html#mac-address).
