# Build 44

Version: `1.6.4-android.44-node24-prototype`.

- Z taps and holds share tilt's finite motion planner, so X/Y and Z can move simultaneously. The selected preset bounds total vector feed, with each axis additionally limited by its saved maximum feed and acceleration. Ordinary Z handlers remain in use when Tilt jog is off.
- Z remains enabled while Tilt jog is active or waiting for flat neutral. Explicit Z input can begin a Z-only session before calibration; it cannot authorize X/Y tilt movement. Fresh UI input can operate Z when the tablet angle or sensor reading prevents tilt. UI stalls, backgrounding, connection faults and ordinary machine-state restrictions still stop jogging.
- Releasing a held Z button cancels queued Z travel, then resumes fresh X/Y input after cancellation is confirmed. The tilt session and calibration are preserved; no flat reset is required. Because cancellation stops the combined GRBL jog queue, X/Y may briefly pause at Z release or reversal.
- Quick Z taps retain the selected finite Z increment, with one application per step ID. Late taps expire instead of executing after a delayed request. The USB validator accepts only ordered, bounded finite X/Y/Z words and retains its empty-queue and 250 ms native write deadline checks.
- A 7 px readiness light sits inside the upper-right corner of the jog container. Green means jog/tilt ready, amber means tilt is waiting for flat calibration or recovering, and grey means unavailable. The light has an accessible description and takes no layout space. XY-pad readiness uses its existing poll; no extra status polling was added.

## Validation

- All 283 regression tests passed, including simultaneous XYZ limits, exact Z taps, Z release, calibration, input expiry, actual jog-button behavior and readiness-light states.
- Both production interfaces and the optimized release APK built successfully. The final APK's extracted backend passed simulated USB tests for combined X/Z movement, Z-only movement during calibration, continued X after Z release, exact Z steps, startup teardown and reconnect.
- Portrait (800 x 1249 CSS px) and landscape (1280 x 600 CSS px) previews were inspected. The indicator is 7 x 7 px and absolutely positioned. Jog/DRO dimensions exactly match Build 43 at both sizes; landscape controls have no overflow.
- Android lint: 0 errors, 9 existing warnings. Version 44, matching signing certificate, release flags, native sensor bridge, payload, Node 24.21.0 and armeabi-v7a verified.
- No tablet installation, repository push or physical machine motion was performed. Simultaneous tilt/Z movement still needs confirmation on the machine.
