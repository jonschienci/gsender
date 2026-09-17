# Build 35

Version: `1.6.4-android.35-node24-prototype`.

Pendant jog buttons now reserve their touch gesture instead of allowing Android scrolling to take it over. Pointer cancellation, lost capture and touch cancellation clear the pending long-press timer and stop an active hold. This fixes a reproduced case where a cancelled press could start a delayed jog. Pressed-state feedback is immediate and the release color transition is shorter; the existing hold threshold and movement settings are unchanged. Hardware latency has not been measured.

The tablet XY pad now accounts for motor-step and position-report rounding when checking movement against its commanded path. A simulated 80-step/mm controller reproduced the previous false path-deviation failure. Rounded endpoints are retired only after all movement receipts and a fresh Idle report received after those receipts. The tolerance is capped at 0.05 mm, and existing motion queue, contact lease and timeout bounds remain in place.

The pad retains the specific stop reason until the next valid center press, so readiness polling cannot replace a useful error with rapidly changing text. An old contact cannot stop a newer contact.

Stable 1.6.4 core, dev jogging/pendant source pins, runtime and signing certificate remain unchanged. Both in-app build labels and the Android app title show Build 35. No knob firmware update is required.

Validation: 251/251 Android tests; both frontend builds; release assembly and lint; APK payload/runtime/ABI and signing verification. The actual pendant component test reproduces delayed jogging after cancellation before the fix and passes afterward. The finished APK also passes a simulated USB backend scenario covering regular continuous jogging, transition to the tablet pad, XY jogging without a knob, automatic knob handover and release cancellation without replay. Concurrent physical-knob tests in the shared repository were retained.

No physical CNC movement or device installation was performed. These changes address reproducible defects; confirmation of the reported symptoms on the tablet remains outstanding.
