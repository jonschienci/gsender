# Selected official updates — pending next Android build

Implemented in source on 2026-11-27 and committed for the next Android build.
No new APK, installation, or device benchmark was made for this integration.
Build 79 remains the latest distributed custom build; its previously shipped
kiosk source is included as the baseline for display recovery.

Compared the official `features/android` tip `b907f082` with `dev` at
[`d141e293`](https://github.com/Sienci-Labs/gsender/tree/d141e293e8794483b4d74cf37b2401ad5adfc6d5).
The Android branch is already contained in that dev revision. This is a selective
port, preserving the custom pendant layout and controls.

## Included

| Area | Result | Official source |
| --- | --- | --- |
| Surfacing | Retract Z before the initial XY move and center re-entry; cap ramp depth; plunge at 25% of cutting feed and restore cutting feed. Preserve the custom final-layer spindle-stop behavior. | [e73082af](https://github.com/Sienci-Labs/gsender/commit/e73082afb83ee2377ed2077537c45fec33efaba0) |
| Tool changes | Restore saved positions/offsets in millimetres before restoring the job's inch/metric mode. Both Grbl controllers update their units modal as G20/G21 passes through the feeder/sender, without waiting for a later parser report. | [e33bb93e](https://github.com/Sienci-Labs/gsender/commit/e33bb93e1ebe7efd4bbdd940d9922c93500866e7), [03cb6082](https://github.com/Sienci-Labs/gsender/commit/03cb60821b2102ffb97c3a326f70382da9a7d6b3) |
| Start from line | Select the intended workspace after the start hook and before the first positioning move. Retain the existing selected-workspace fallback when the file has no explicit WCS. | [c467bdd1](https://github.com/Sienci-Labs/gsender/commit/c467bdd110a2af3f51c39a1c36f2b36347b25898) |
| Config responsiveness | Cache firmware/profile defaults and menu filtering; debounce search by 200 ms with immediate input feedback; replace edited rows immutably; cancel subscriptions and pending work on unmount. Lazily mount Config once and retain unsaved edits across tabs. Returning to Config refreshes EEPROM only when connected and idle. | [1db11ee7](https://github.com/Sienci-Labs/gsender/commit/1db11ee7a3d255b6c261e4c8d5c1ae014cd43887), adapted to the custom shell |
| Android renderer recovery | Recreate a crashed/killed WebView without restarting the Node service or replaying job commands. Revoke manual-input leases and stop tilt sensing during recovery; ignore stale page callbacks. Allow two automatic retries per minute, then expose an explicit “Reload display” action. | [Official MainActivity](https://github.com/Sienci-Labs/gsender/blob/d141e293e8794483b4d74cf37b2401ad5adfc6d5/android/app/src/main/java/org/sienci/gsender/pendant/MainActivity.kt), adapted to the custom service, kiosk and authentication |
| Official toolpath renderer | Use the official `@sienci/gviewer` 0.1.52 WebGL renderer in top-down mode, retaining the custom UI overlays. Added at the user's subsequent request; see [renderer integration and validation](PENDING-OFFICIAL-RENDERER.md). | [Official pendant Visualizer](https://github.com/Sienci-Labs/gsender/blob/d141e293e8794483b4d74cf37b2401ad5adfc6d5/src/pendant/src/components/Visualizer.tsx) |

USB transport, A/B handoff, Node runtime, custom jog/tilt/
knob behavior and normal UI styling are unchanged by this integration. Optional
plugin, pairing and new warning UI were not imported. Existing unshipped work
elsewhere in the checkout is separate from this change.

## Validation

- Before pushing, the exact selected source passed 95 Jest tests across eight
  suites: simulated surfacing paths, both controllers with an inert transport,
  inch-mode tool-change returns, Config caching/search/tab lifetime,
  delayed-report teardown and the existing jog-streamer regressions.
- 34 Node/Java tests passed for kiosk lifecycle, display-recovery limits,
  geometry/parse reuse, viewport bounds, Z scaling and benchmark orchestration.
  The retired SVG adapter test was skipped; the APK-payload suite was excluded
  because no new APK was assembled.
- The actual official renderer passed the headless Chrome WebGL regression;
  the complete pendant web bundle compiled successfully. See the
  [renderer validation](PENDING-OFFICIAL-RENDERER.md) for scope.
- `MainActivity`, `KioskController` and the recovery policy compile against
  Android API 35 and frozen Build 79 app/USB classes. This is a Java compile
  check, not an APK build.

These checks do not establish a frame-rate gain or validate real CNC motion.
Before distributing a build, verify renderer recovery, tab switching and the
affected tool-change/resume/surfacing operations on the intended tablet and
controller. Renderer recovery does not prevent Android from killing the entire
app under extreme memory pressure.

Integration-only before snapshots, patch and source hashes are saved outside
the checkout in the Codex workspace under `work/upstream-integration-20261127/`.
The separate `build79.patch` applies to the frozen Build 79 source and excludes
the unrelated old test-fixture adjustment. Use it when assembling from that
baseline so unrelated pending USB/UI experiments are not accidentally included.
That earlier patch does not contain the subsequent renderer integration, which
has its own snapshots and incremental patch documented separately.
