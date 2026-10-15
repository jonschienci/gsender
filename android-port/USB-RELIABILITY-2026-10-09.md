# USB reliability investigation — 2026-10-09

Status: source fixes prepared and checked; no APK built or installed. Sustained physical-job reliability is unverified.

## Findings

- L1108 (`PREL110803684`) wired ADB works directly with the Mac. It runs Android 16 / ARM64 and the Build 66 ARM64 compatibility APK, whose Java/JS/UI payload matches original Build 66.
- Captured Android USB history shows one STM32 SLB (`0483:5740`) attached as `android-usb:1004:0`. The app opens it eight times, but reads fail after roughly 0–1.3 seconds with `USB get_status request failed`. Android retains the same enumerated device until the later physical detach; these initial failures are not detach notifications.
- At raw tablet log time `04:06:02.109`, the backend stops with `Cannot read properties of null (reading 'writeImmediate')`. The exact installed bundle location, `server.cjs:607:4360`, maps to the 500 ms continuation inside grblHAL `reset:limit`. This is a secondary software failure after USB loss.
- Rapid automatic reconnects were resetting their failure count whenever open succeeded, even if it lasted only milliseconds. This defeated the intended backoff.
- Prior Lenovo Build 69 physical-job tests failed with the finite bulk-read workaround too. Earlier direct standard USB control requests also failed without either gSender backend running. These observations do not prove a specific hardware defect, but the current error cannot be attributed solely to UI load, the official-code integration, or 32-bit Node: L1108 Build 66 / ARM64 reproduces it.

Raw evidence is local under `work/usb-reliability-l1108-20261009/`: `logcat.txt`, `usb.txt`, `package.txt`, `exit-info.txt`, and `build66-server.cjs`. Raw tablet timestamps differ from the Mac's local date/time; do not interpret them as Mac wall-clock times. Previous job evidence remains under `work/build69/lenovo/job-disconnect/` and `work/build70/`.

## Official-source comparison

Fetched current official refs into an isolated review clone, leaving the user's branch unchanged:

| Ref | Commit |
| --- | --- |
| `dev` | `81fc7f8ad1756f6160fe246ef4cf466411f7952a` |
| `master` | `4b4292b822c8273198fdbf453d01e3d56ebcef07` |
| `features/android` | `f961036dd9e93df2af0f36aa580da2ac501bc994` |
| `features/android_v2` | `6f64e58490a0dc207826ee0e03bcf22066746275` |

The latest [official USB bridge](https://github.com/Sienci-Labs/gsender/blob/6f64e58490a0dc207826ee0e03bcf22066746275/android/app/src/main/java/org/sienci/gsender/pendant/usb/UsbDataBridge.kt) still uses default asynchronous `SerialInputOutputManager` reads and driver 3.9.0. Its USB code is unchanged between the two Android refs. The official grblHAL controller also retains the unguarded delayed limit-reset callback. A wholesale merge is therefore not a remedy for the captured failures.

The separately maintained USB library [added queued reads in 3.10.0](https://github.com/mik3y/usb-serial-for-android/releases/tag/v3.10.0), retained in [3.11.0](https://github.com/mik3y/usb-serial-for-android/releases/tag/3.11.0). Its empty-completion GET_STATUS check remains present, so upgrading must not be described as a proven fix for this particular error.

## Prepared changes

1. Pin USB driver 3.11.0; enable 16 endpoint-sized asynchronous read buffers for STM32 SLB and Pico SLB-Lite. This keeps pending reads available while a prior packet is delivered to Node, without waiting for a larger packet buffer to fill. It replaces the failed finite-read experiment. Other USB identities retain their reader configuration.
2. Mark reader failure immediately across threads. Reject serial-worker requests queued before teardown, preserving fatal-error handling and the existing no-resend policy.
3. Cancel connection-owned delayed reset/unlock and feed/spindle override callbacks on close/destroy. Also verify connection identity and open state at execution, so old actions cannot reach a replacement connection.
4. Retain reconnect backoff across short successful opens (2, 4, 8, 16, then 30 seconds). A connection lasting at least 30 seconds restores the initial delay. Explicit manual disconnect, permission handling, new-attachment discovery, and job-stop-on-disconnect remain in place.

No UI, native Node runtime, job buffer size, firmware, or tablet settings are changed by this work.

## Validation and remaining check

- 48 focused checks passed: controller startup, delayed reset/overrides, SLB/SLB-Lite autoconnect, disconnect recording, serial streams/partial writes, queued native driver reads, and write deadlines.
- The actual pinned driver retained 10,000 simulated mixed-size binary packets in order and canceled its queued reads on close. Empty completions with a failed health check and real transfer failures still propagate. These are host-side USB API simulations, not physical bus measurements.
- Complete USB Java module compiled against Android API 35 and the pinned 3.11.0 AAR. Existing Android backend transforms still compose for both controllers.
- The L1108 still has Build 66. No machine commands were issued during this investigation. No APK, commit or push was made.

Next validation must use a user-started physical SLB job with the candidate build, retaining job and USB diagnostics through completion or the first failure. A successful idle connection alone is insufficient. Comparing the same SLB/cable on K90 would help isolate differences between tablet USB hosts; that comparison has not yet been established.
