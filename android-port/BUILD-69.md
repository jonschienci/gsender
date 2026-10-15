# Android Build 69 — running-job USB diagnostics

This is a diagnostic build, **not a confirmed disconnect fix**. Build 68 failed during the user's real `relief-20480KiB.nc` run on the Lenovo TB-8506F / STM32 SLB Ext. The failure occurred 3.606 seconds after Start, with 556 commands sent and 525 acknowledged. There was no preceding CNC alarm/error or low-memory indication; the backend event-loop p95 was 22.1 ms. Data arrived 5 ms before the native error. The operating system continued to list the device until the later detach.

## Changes

- Capture the USB transport error before the synchronous workflow-stop notification. Previously the recorder mislabeled this failure as an ordinary job ending, losing the reason.
- Record read/write operation, original exception stack, presence/permission, successful byte/write counts and worst queue/write times.
- After reporting the serial failure, make two read-only USB standard control probes (GET_STATUS and GET_CONFIGURATION, at most 200 ms each) and preserve Linux errno. These are observations **after** the original error, not proof of its original errno. They can distinguish a stalled status request from an unavailable device or invalid descriptor if reproduced.
- Persist two bounded native failure snapshots on the tablet, independent of ADB captures. Pull `Android/data/com.gsender.android/files/diagnostics/usb-last-failure.txt` and `usb-previous-failure.txt` from shared storage after the job. An internal-storage fallback is used only if external app storage is unavailable.

The existing reader, sender, ACK accounting, reconnect and stop-on-disconnect behavior are retained. Diagnostics never read a bulk data endpoint, resend motion, reset USB or resume a job. Frontend files are byte-identical to Build 68 except build labels. No unrelated UI/runtime experiments are included.

## Validation

53 focused serial, reconnect, integration and job-recording tests pass. The job-log regression executes the transformed real Connection close callback with 31 commands pending and verifies the report retains the USB cause before workflow shutdown. A native test checks probe types, bounds, invalid descriptors and error preservation. Android release compilation, lint, APK signature/runtime/payload checks pass.

**Physical-job result: failed twice.** On 7 October 2026 the Lenovo ran `relief-20480KiB.nc` and disconnected after 8.534 and 13.102 seconds, with 32 and 31 commands still awaiting acknowledgment. Both failures came from the USB read path (`USB get_status request failed`). No preceding CNC alarm/error or low-memory indication was recorded; backend event-loop p95 remained about 22 ms.

In both failures the immediate read-only GET_STATUS retry succeeded, while GET_CONFIGURATION returned Linux errno 75 (EOVERFLOW). These post-failure probes do not establish the errno or cause of the original read failure. A subsequent errno 19 event coincided with unplugging the CNC to reconnect the tablet to the Mac. The reports correctly retained the disconnect cause.

Evidence: `work/build69/lenovo/job-disconnect/`, including both exported job JSONs, native failure snapshots and `job-comparison.json`. [Build 70](BUILD-70.md) provides an isolated Build 66 comparison for the same physical job. The disconnect is unresolved; idle-only testing is not the success criterion.

## Artifact

- Version: `1.6.4-android.69-node24-prototype`; code 69; ARM32.
- `gSender-Android-build-69.apk` — 77242314 bytes.
- SHA-256: `59b0ac1ba3d6ed7d3143aaf30831eb770dbee0a91c1d9d81bac3fdd43f780f3f`.
- Same personal package/signing key, data-preserving installation.
- Local evidence/source: `work/build69/`; failed Build 68 physical-job evidence: `work/build68/lenovo/job-disconnect/`.

No commit or push was made.
