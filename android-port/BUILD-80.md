# Android Build 80 — official renderer and updater compatibility

Build 80 preserves the custom pendant interface and adds the selected official changes committed at `df30c9e2e`. It uses Node 24.21.0 and USB serial driver 3.9.0. Unrelated working-tree USB, native-runtime and UI experiments are excluded.

## Changes

- Use the official `@sienci/gviewer` 0.1.52 WebGL renderer for pendant toolpaths and generated previews, retaining custom overlays, top-down view, jog/tilt/knob controls, Z ruler and layout. Position-only updates reuse geometry without another toolpath draw.
- Apply the selected surfacing, inch/metric tool-change, start-from-line workspace and Config responsiveness fixes. Recover a failed WebView with bounded retries without restarting the backend or replaying commands.
- Retain Build 79 kiosk edge controls and the existing A/B handoff guard. Switching to an installed official app still requires its compatible handoff-enabled variant.
- Publish both ARM64 and ARMv7 APKs in the same release. Previously GitHub only offered Build 66 ARMv7, causing the updater on an ARM64-only tablet to report a missing APK even when Build 79 was installed.

The integrations and their implementation tests are described in [official renderer](PENDING-OFFICIAL-RENDERER.md) and [selected official fixes](PENDING-UPSTREAM-2026-11-27.md).

## APK selection and updates

| Android ABI | Release asset |
| --- | --- |
| `arm64-v8a` (64-bit ARM, including the L1008) | `gSender-Android-build-80-arm64.apk` |
| `armeabi-v7a` (32-bit ARM, including the older Lenovo installation) | `gSender-Android-build-80.apk` |

These are architecture variants, not tablet-model-specific builds. Both use package `com.gsender.android`, version code **80**, version name `1.6.4-android.80-node24-prototype`, minimum Android API 26, and the existing signing key. Android's supported ABIs determine compatibility; a 64-bit processor can run a 32-bit Android OS. The updater automatically selects the matching asset and preserves app data during an in-place update.

Future releases must upload both correctly named assets and verify their GitHub SHA-256 digests before publishing the draft. This prevents a partially published release from hiding the update on one architecture. APKs belong in release assets, not the source repository. Checksums and runtime provenance are recorded in [build-80.json](releases/build-80.json).

## Validation

Both release variants passed compilation, lint, APK/native/payload verification, signature matching with Builds 66 and 79, build-label checks, A/B launcher/provider retention and alignment checks. Their application payload is identical. The test runs passed 390 Android/backend/WebGL checks, 10 additional UI/geometry checks, 95 focused upstream-fix tests and 7 updater-selection tests. One retired SVG adapter test is intentionally skipped; the replacement WebGL test ran. The packaged simulator checked stream integrity, cancellation and subsequent jobs without a physical CNC.

Build 80 was installed over Build 79 on the **Pretech L1008 (Android 16, ARM64-only)**, preserving app data. Its installed APK hash matched the release artifact, and backend/display startup completed without a fatal error. The installed official 15000 build lacked A/B handoff; the existing handoff shell was restored as `1.7.0-Edge-4-ab.10`, preserving all 218 original non-manifest application entries. Official startup and switching from official to custom were checked, with the inactive peer stopped.

No physical CNC was attached. These checks do not establish tablet frame rate or physical job reliability; no performance gain is claimed. ARMv7 passed build/native checks but was not launched on a 32-bit tablet during this release. Detailed results and hashes are recorded in [build-80.json](releases/build-80.json).
