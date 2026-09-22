# Build 54 — revised pendant UI and responsive job display

Build 54 combines the approved UI work with the performance and onboard logging changes from Builds 51–53. It retains the stable 1.6.4 core, scoped dev jogging/pendant overlay, Node 24.21.0 ARMv7 runtime, package identity and existing signing key.

## Included changes

- Updated pendant jog/DRO dimensions, stacked Z/A controls, jog page selection and tilt controls. Short landscape layouts keep the DRO footer and jog controls above navigation.
- Shorter 48 px connection bar and 52 px navigation bar; expanded trays share those boundaries. The build badge is white in dark mode.
- Android status bar hidden while gSender is open; Android navigation remains available.
- Packaged stylesheet ordering matches the approved preview; Move panel overlap, corner-caption spacing and dark tray-heading contrast corrected.
- Integrated machine state in the CNC connection control, revised movement and macro forms, paged Tools/Macros and compact/expanded console panels.
- File/recent-file controls and G-code listing in the visualizer; up to five browser recent-file payloads retained locally.
- Virtualized console with hidden-history updates suppressed while preserving typed commands and current history when reopened.
- Cached worker previews, batched serial display copies, bounded console history, coalesced position/progress updates and 100 ms GrblHAL status polling from the performance builds.
- Updated [Android integration notes](../ANDROID-PORT-EXPLAINED.md) and [Build 53 three-tablet benchmark PDF](benchmarks/gSender-Android-Build-53-Benchmark-Report.pdf).

## Validation

- 322 automated regression tests passed, with zero failures or cancellations.
- Backend and both frontends compiled; Android release assembly/lint and APK/runtime verification passed.
- APK: `gSender-Android-build-54.apk`, 83,195,642 bytes.
- SHA-256: `815154a129268cd4328b31c39744f540d37f978e842f03c5bc50f26fb6b47121`.
- Installed on the K90 (Android 16), retaining app data; the installed APK hash matches the release artifact. Cold launch succeeded and no crash/error matches appeared in the app's captured log.
- Inspected Carve/DRO, both jog pages, Status, Move, Tools, Console, Macros and its editor, CNC knob and file/editor panels. Portrait and landscape checks caught and corrected production CSS ordering, clipped DRO actions, overlapping Move controls, corner-caption spacing and dark text contrast.
- Loaded, viewed, closed and reopened the existing 128 KiB contour file; verified both file-picker fallback and cached recent-file loading without starting a job.
- Supplementary preview checks covered crowded Tools/Macros pagination in both orientations; expanding Macros increased visible capacity. Demo entries are preview-only and are not shipped.
- Android status bar is hidden in gSender and the user's rotation settings were restored after checks. Machine-dependent connected/running states were not exercised without a CNC.
- No tablet benchmark, job simulation or physical CNC movement was run for this build. Build 53's K90 animation regression remains unresolved; its report is not a measurement of Build 54.

Separate native-runtime/workflow experiments and local editor configuration are not part of this release.
