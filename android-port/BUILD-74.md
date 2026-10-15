# Build 74 — latest approved pendant UI

2026-10-15. ARM64 update for the L1108. Version `1.6.4-android.74-node24-prototype`, code **74**. Based on Build 73, with the completed changes from **gSender Android UI development** through the Z-readout clipping fix.

## Included UI

- Larger, bold, axis-coloured X/Y/Z/A readouts and matching action popups. Popups anchor within the viewport; the origin dot contains individual Go to Zero actions. Readouts show `ERROR` when the formatted value exceeds nine characters.
- Work/Machine coordinate selection and workspace controls in the viewport. Switching coordinates changes readouts without relocating the origin dots/icons. Machine and job boundaries have matching coloured labels.
- View-centering/fit controls, deliberate touch-to-move arming, and held Home/Zero XY controls. Zero XY leaves Z and A unchanged. Coordinate actions remain locked during a running job.
- Z readout can extend left without clipping; the inset rotary dial's readout expands to fit its text.
- The Misc switch selects jog buttons or the XY pad; page cycling switches between that choice and Feed/Spindle. Existing tilt, knob and job behavior is retained.
- Combined Job logs & Benchmark panel, including existing simulation choices. Wi-Fi files opens its receiver directly and Return restores the previous page, including file selection.

## Validation and provenance

- 381 Android/backend tests and 10 existing MJS tests passed. The compiled UI passed portrait/landscape checks, calculator and held-action checks, run locks, persistent touch-target checks, rotary display, Zero XY command routing, origin Go to X Zero, coordinate-switch origin stability and nine-character/error boundaries. All browser command checks used an intercepted simulated connection.
- Release compilation/lint, payload, signing and 16 KiB alignment checks passed. The initial verifier invocation needed its explicit ARM64 option; rerunning with the correct architecture passed without changing the APK.
- Node and libc++ native library bytes match Build 73. Its USB/jog/native source baseline is preserved; pending experiments from the development checkout were excluded from this isolated artifact.
- Exact build source and validation evidence: task workspace `work/build74/source` and `work/build74/`. UI source was also merged into the development checkout while preserving its other pending work. An ordinary checkout build includes those experiments and does not reproduce this artifact.

Artifact: **gSender-Android-build-74-arm64.apk**, 78,350,812 bytes. SHA-256: `fe063d7efc8507dec509363568db606f3c1ba95345a60e8d77453353050ba116`.

The APK updates the existing personal app and retains its data. No physical CNC job was run for this UI update. Installation/startup results are recorded with the local release evidence. APKs, keys, SDKs and generated payloads remain outside Git; no commit or push was requested.
