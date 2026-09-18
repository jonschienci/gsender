# Build 46 — job performance

Built on 2026-09-18 from the frozen Build 45 source plus reviewed performance changes. Build number 46 appears in the app and APK filename. No layout, controls, or graphics updates from the other UI tasks are included: all 1,028 upstream source files and 12 Android UI TSX/CSS files match the Build 45 snapshot. The top-down preview's rendering implementation changes, but its controls and layout do not.

## Changes

- Render the pendant toolpath as a worker-generated bitmap with a maximum edge of 1,600 pixels. Native draw paths are limited to 512 segments per batch, avoiding the huge SVG/GPU allocations observed in the threshold tests. Bounds and live position overlays remain in SVG; zoom/pan requests redraw the preview for the new viewport. Original G-code commands and their precision are unchanged.
- Support both the 1.6.4 worker-buffer format and the newer precomputed segment-group format. Superseded workers and blob URLs are released. Late preview replies cannot replace the current job.
- Keep visualizer options stable across position updates, skip unchanged overlay updates, and coalesce viewport work with animation frames. Gesture telemetry is disabled unless explicitly launched with the benchmark intent.
- Store job lines as a compact index into the original text rather than retaining an array of individual strings. Preserve filtering, command order, hold/resume, start-from-line and rewind semantics.
- Select the Node heap budget from physical RAM. The 1.5 GiB app planning baseline applies at 2 GiB physical RAM, scales with larger devices, and is not a reservation or total-app limit. This APK uses the existing ARM32 Node 24.21.0 runtime, capped at 1,536 MiB V8 old-space. ARM64 runtime delivery remains separate work.

- Correct the network disconnect handler to accept an omitted callback. This fixes a backend error discovered when leaving the test simulator after the performance cases.

## Validation

- 294 Node regression tests pass; native memory-policy tests pass.
- Isolated JNI probe using the final APK libraries passes on K90: 1,536 MiB old-space / 1,632 MiB total V8 heap limit; 8 MiB smoke allocation.
- Release assemble/lint and APK payload/native-library verification pass. Release signature remains compatible with existing installations.
- K90 simulated-controller comparison: all 25,898 arc-job commands matched the ordered SHA-256, about 500 commands/s, zero receive-buffer overflows. The tablet displayed the completed-job dialog.
- 30 MiB and 40 MiB relief fixtures loaded, streamed during automated visualizer pans, and stopped on request. No observed Vulkan allocation failures, preview worker errors or spontaneous app crash.
- Running-pan Android frame-duration p95: 500 ms for all three cases, versus at least 4,950 ms for arcs and 4,500 ms for 30 MiB on Build 45. These host pipeline measurements are not presented FPS or finger-to-display latency; the interface still misses frame deadlines under stress.
- Sampled peak combined app/renderer PSS: about 584 MiB (arcs), 1,037 MiB (30 MiB relief) and 1,215 MiB (40 MiB relief). Warm-process samples and garbage collection affect these values.

Only the arc case completed its entire command stream. Large relief cases are short samples, not full-job or endurance qualification. Tests used loopback Ethernet through ADB to a 500-command/s simulator, not USB hardware or a physical CNC. Loading 100+ MiB files and operation on a tablet with only 1.5 GiB available remain unverified.

The APK is `gSender-Android-build-46.apk`. Detailed captures, phase timings, screenshots and comparison report are retained under the workspace's `outputs/job-benchmark/k90-build46-20260918/corrected/`. Build source and isolation hashes are retained under `work/build46/`.

## Pending source-only addition — SLB-Lite auto-connect

Requested 2026-09-18 after Build 46 was delivered. No APK was rebuilt or installed for this addition; version 46 and the delivered artifact remain unchanged. The frozen built snapshot is retained separately from this pending patch.

- Extend USB auto-connect from STM32 CDC `0483:5740` to include Pico CDC `2e8a:000a`, as observed in K90 USB attachment history at epoch 1789765285064 (decimal VID 11914, PID 10).
- Add the same Pico identity to Android's `USB_DEVICE_ATTACHED` filter so Android can offer gSender as its default handler for the Lite. Android's initial user grant/default choice is still required; automatic attempts do not repeatedly request permission.
- Keep first-serial-port selection, exactly-one-board selection, existing active-connection protection, reconnect/backoff, permission-denial handling, and deliberate Disconnect suppression for both identities. ESP USB knobs are not selected as the CNC.
- 17 source-level tests pass across both identities, mixed-board ambiguity, Lite plus knob, retry/re-enumeration, permission changes and Android-filter consistency. The pending change is not yet tested in an APK or on physical Lite hardware.

The normal Pico identity is also documented by [grblHAL's RP2040/RP2350 USB descriptors](https://github.com/grblHAL/RP2040/blob/master/stdio_usb_descriptors.c). Do not broaden the filter to all Raspberry Pi USB devices: bootloader and unrelated product IDs are excluded. New firmware using a different USB identity will need that identity verified and added explicitly.
