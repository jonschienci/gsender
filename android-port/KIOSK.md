# Managed Android kiosk

Status: introduced in Build 59 and retained in [Build 60](BUILD-60.md). Enrollment is separate from APK installation. Validate the exit gesture, USB permission/reconnection and file-picker workflow on each tablet before normal use.

The app hides status/navigation bars once its build-number exit target is rendered. On an enrolled tablet it starts Android managed lock-task mode. Build 79 guards the first bottom swipe so it reveals Android's real clock/system indicators and navigation controls instead of immediately navigating Home. Those controls become available while the bars are visible. Native Home/Recents can then navigate away from gSender; returning to gSender restores fullscreen. Notifications/shade and the normal power menu remain disabled. Five taps on **Build** within two seconds release the managed session and keep Android controls visible; another five return to kiosk. Touching elsewhere resets a partial sequence. This works in pendant and desktop views.

Build 79 uses non-transient bars so revealed bars report their visible insets. The native view adds only those visible insets, together with keyboard/cutout protection, and removes extra space when the bars hide. No hidden-bar height is permanently reserved. Revealed bars hide after three seconds; a held touch cancels that timer and restarts it on release so automatic hiding does not shift controls during a held jog/drag. Exiting kiosk or pausing the activity cancels automatic hiding. The native light window requests dark bar icons to avoid white-on-white controls. Managed navigation features use SYSTEM_INFO while hidden, adding HOME and OVERVIEW after a reveal; they are guarded again before hiding. The app allowlist remains gSender only, but Android 16's native Home navigation was observed to reach the launcher when enabled. See [Build 79](BUILD-79.md) for checks and scope.

The user's enabled/disabled choice survives app restarts. Focus changes, file pickers and permission dialogs do not silently reverse a deliberate exit. Loading failures, backend errors and a missing build badge release kiosk so Android remains accessible. Kiosk changes do not start, stop or resume a CNC job. An unenrolled tablet gets fullscreen only; gSender never silently falls back to screen pinning.

## Enroll a tablet

Install an APK containing `KioskAdminReceiver` first. Managed setup uses Android 9 or newer, a single primary user, no Android accounts, and no other device administrator. The helper checks these conditions and stops if Android refuses enrollment. It never removes accounts, changes users, wipes storage or resets the tablet.

```sh
python3 android-port/scripts/kiosk-device.py --adb /path/to/adb --serial TABLET_SERIAL
python3 android-port/scripts/kiosk-device.py --adb /path/to/adb --serial TABLET_SERIAL --enable
```

The first command is read-only. The second makes gSender the device owner and opens it. Enrollment is separate from APK installation and applies to each tablet individually. Only gSender is allowlisted; no system apps are disabled, no custom launcher is installed, and USB debugging remains available. On the tested YC-SM08M, edge swipes can briefly reveal the manufacturer’s system strip, while Home/Recents remain blocked. Android file selection and permission dialogs invoked by gSender can still appear; the fullscreen setting does not replace these workflows.

Before disconnecting ADB, verify: the badge is reachable in both orientations; five-tap shows Android controls; five-tap locks again; edge swipes/Home/Recents cannot leave while locked; the file picker returns normally; USB permission/attach/reconnect work. Do this with no CNC motion or job running. Check a cold launch and a frontend startup failure as well.

To use Android or service the tablet, five-tap Build and leave kiosk disabled. This releases the kiosk session but keeps device-owner enrollment for future use and APK updates. Android restricts ordinary uninstall of a device-owner app; turning kiosk off does not remove enrollment. Do not use account deletion or a factory reset as an automatic enrollment/uninstall workaround. Keep the signing key and USB debugging access available during prototype validation.

## Implementation and validation

- `KioskAdminReceiver` is protected by Android's `BIND_DEVICE_ADMIN` permission and declares no wipe/password policies.
- `KioskController` configures only lock-task allowlisting/features. It uses Android fullscreen APIs and preserves keyboard/cutout insets.
- `KioskSession` separates lifecycle/maintenance state from Android calls. Tests cover delayed UI readiness, unenrolled devices, exit persistence, refusal/retry and startup failure recovery.
- `AndroidBuildBadge` uses a real, gesture-driven anchor intercepted by the native host. Native handling requires a focused, resumed, first-party main frame and a user gesture; there is no general-purpose device-administration JavaScript bridge.
- Five regression tests pass, covering tap timing and kiosk lifecycle/maintenance behavior. An isolated browser test also verifies real fifth-tap activation, ignored synthetic/partial taps, outside-touch reset and unchanged ordinary-browser behavior. Native classes compile against Android SDK 35, and the admin XML compiles with AAPT2. Build 59 release assembly, lint and APK integrity checks passed. See [Build 59](BUILD-59.md) for managed-kiosk tablet validation and remaining hardware checks. Build 60 passed installation and cold-launch checks on the K90 without device-owner enrollment; those checks do not establish managed-kiosk behavior on the K90.

References: [Android lock task mode](https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode) and [immersive system bars](https://developer.android.com/develop/ui/views/layout/immersive).
