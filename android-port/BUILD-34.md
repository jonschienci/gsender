# Build 34

Version: `1.6.4-android.34-node24-prototype`.

Fixes tablet XY pad cancellation when taking control from an automatically armed USB or Bluetooth knob. The knob acknowledges the app's disable request with a fresh INPUT context. Previously that expected acknowledgement was treated as a knob control change and stopped the tablet contact. It is now accepted only for a fresh, ready, neutral baseline with unchanged controls while the tablet owns motion and the knob is disarmed. Actual control changes, held/not-ready acknowledgements, alarms, backgrounding and expired touch leases still stop motion.

No firmware update is required. Stable 1.6.4 core, dev jogging/pendant source pins, frontend layout, runtime and signing certificate remain the same as Build 33. Both in-app build labels and the Android app title show Build 34.

Validation: 236/236 Android tests; release assembly and lint; APK payload/runtime/ABI and signing verification. New handover regressions fail against Build 33 and pass with Build 34. The finished APK also passes a simulated USB backend scenario covering regular-jog-to-pad transition, XY jogging without a knob, automatic knob handover and release cancellation with no replay. USB and Bluetooth handover unit tests cover the neutral acknowledgement and reject actual control changes and non-neutral/not-ready acknowledgements.

No physical CNC movement or device installation was performed. Hardware confirmation of the reported symptom remains outstanding.
