# Build 57 — persistent DRO popup and axis Home controls

Version `1.6.4-android.57-node24-prototype`. Includes Build 56's interface and toolpath fixes;
retains the Node 24.21.0 ARMv7 runtime, package identity, and signing key.

## Changes

- Selecting a coordinate in Machine mode now keeps its popup open. Machine
  coordinates remain read-only; Edit Work switches to the current work coordinate
  and opens the numeric keypad. Live position updates preserve an editing draft.
- Holding Home places individual Home X/Y/Z/A controls in their corresponding
  axis-label slots. Each homes only that axis. Opening or dismissing the menu
  does not home the machine; disconnect/background cancels a pending hold.

## Validation

- 335 automated regression tests passed; no failures or cancellations.
- Both frontends and backend compiled. Android release assembly, lint, embedded
  payload/runtime integrity, and APK signing checks passed.
- Packaged UI checked in portrait and landscape, including persistent Machine
  coordinate popup, Edit Work/keypad behavior, decimal entry and custom feed.
- Focused source/browser checks verify Home controls align with their axis slots
  and issue only their named-axis command. Machine commands were intercepted.
- Installed the exact release APK on Samsung SM-X133 (Android 16) and ZTE K87CA
  (Android 10); installed SHA-256 matched on both. Samsung passed a cold launch
  after official OS updates: Android 16 / One UI 8.5, `BP4A.251205.006.X133DXU4BZH1`,
  security patch `2026-07-05`, Google Play system update `2026-08-01`. Both update
  screens then reported no further update. Its installed APK still matched the
  release hash; no reinstall or new APK was needed.
  ZTE showed a blank page with WebView 83.0.4103.106; its launch verification is
  deferred pending a WebView update and Google Play account authentication.
- No tablet benchmarks or physical CNC motion tests were run for this release.
  The Build 55 performance report remains the historical measurement baseline.

APK: `gSender-Android-build-57.apk`, 83,210,166 bytes.

SHA-256: `3a1171dd83d5114408045e921bd4a9a948bbc38a0ebce80a4b3a95f47694ded3`.

Frozen source and release/device verification records: `work/build57/`.
Separate runtime/workflow experiments remain excluded. The release commit includes
application source, release notes, and the updated Build 55 benchmark PDF. APKs,
signing keys, build outputs, and per-device logs remain outside Git.
