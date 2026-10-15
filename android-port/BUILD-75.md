# Build 75 — STM32 USB read-health recovery

2026-10-15. ARM64 test update for the L1108, based on the exact Build 74 source. No new UI changes are imported. Node 24.21.0 and USB driver 3.9.0 are retained.

## Problem and evidence

Build 74 repeatedly opened the STM32 SLB (`0483:5740`) and closed within milliseconds with `USB get_status request failed`, while Android retained the same USB attachment. No competing gSender app was installed. Separate captures also encountered periods with no Android device enumeration; those are distinct from the serial-read failure.

With the backend stopped, a read-only comparison on the L1108 reproduced two failed GET_STATUS requests followed by valid responses on the second attempt. The original heap-buffer read method then received 80 complete CNC status reports during its 20-second phase. Direct-buffer and finite bulk-read phases also completed, with 79 complete status reports each. All three had zero status-query write failures. This was status traffic only, not a running job or a proof of lossless job streaming.

## Changes

- For STM32 CDC ports only, an ambiguous empty read gets at most three read-only USB GET_STATUS checks, with 5/10 ms between attempts and a 200 ms per-request timeout. A reply must have exactly two valid USB 2.0 status bytes. Close, replacement and interruption cancel the check; persistent failure still closes the port.
- Serial writes retain upstream error and partial-write handling. No G-code, motion, spindle, reset or configuration command is resent by this recovery. Pico and other USB drivers retain their existing read behavior.
- Mark a fatal reader failure immediately so queued native commands cannot run before teardown reaches the USB worker.
- Keep reconnect backoff across brief successful opens, resetting it only after a connection lasts 30 seconds. Manual disconnect, permission handling and stop-on-disconnect behavior remain in place.
- Cancel connection-owned delayed reset/unlock and feed/spindle override work on close/destroy. Old callbacks cannot write to a replacement connection.

## Validation

Focused health/reconnect and controller-lifecycle checks pass, including malformed replies, bounded persistent failure, close/interruption, stale connections and delayed writes. The entire USB Java module compiles against the pinned 3.9.0 driver.

All 389 Android/backend regression tests passed. Release compilation, lint, payload/native checks, 16 KiB alignment and signing passed. The exact APK hash was verified after wireless installation on the L1108.

The installed app recovered the previously fatal read-health error on its second check and kept the same USB connection open for at least 167 seconds without a disconnect or app error. It loaded the pendant interface and displayed live CNC data. A running machine job remains unverified; no job was started or resumed automatically.

A separate blank-WebView startup problem was corrected on this tablet: the installed DuraSpeed vendor code reads `setting.duraspeed.enabled` from **System**, while its own setter writes both System and Global. Global was already `0`, but System was unset and the vendor default was `1`. Setting both namespaces to `0` restored the renderer; the next launch loaded the page in 2.352 seconds. This is a tablet setting correction, not an APK UI change.

Artifact: **gSender-Android-build-75-arm64.apk**, 78,351,956 bytes. SHA-256: `a4269326ea2e52786f8f2a5fa81b6f48783a8072adeed2ca67c240f51411b48a`.

The development checkout retains older unshipped 3.11.0 queued-reader/native diagnostics work. The new health adapter is compatible with those APIs, but the installed artifact deliberately uses the original 3.9.0 reader from the isolated Build 74 baseline. An ordinary checkout build does not reproduce this exact APK.

Exact source: task workspace `work/build75/source`; logs and provenance: `work/build75`. Physical diagnostic evidence: `work/usb-reliability-20261015-l1108`. No commit or push has been made.
