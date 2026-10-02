# Job-start cancellation fix and real-machine job logs

Prepared September 29, 2026 against Build 60 and included in [Build 61](BUILD-61.md).
Build 61 was installed and launch-checked on the K90. This document records the
investigation and source validation; release validation is in the build notes.

## K90 incident

The user reported that Start showed Running and started the spindle but no
axis motion followed. The K90 retained the loaded skull finishing job and
console entries containing its header, early motion commands and some `ok`
responses. The Android log also records a USB detach while the device was
being moved to the Mac; that does not establish the cause of the initial stall.
The retained ALARM:2 is excluded: the user confirmed it came from an earlier
attempt with an incorrectly set zero.

A reproducible Build 60 defect was found in the automatic switch to the feed /
spindle page: the effect calls `stopContinuousJog()` after receiving Running.
Both controller implementations translate `jog:stop` into an unconditional
`0x85` byte, even when no jog is active. grblHAL's
[realtime command handler](https://github.com/grblHAL/core/blob/master/protocol.c)
clears the input line and calls `cancel_read_buffer()` for this byte. Therefore a
late UI cancellation can discard queued job commands and their expected replies,
leaving the sender waiting while its workflow still reads Running.

This is a strong candidate for the reported stall, not a proven historical byte
trace: Build 60 did not persist the necessary timestamped transport history.
No physical job was restarted during investigation and no CNC commands were sent.

Prepared correction:

- Automatic page switching no longer sends a jog stop. The existing backend
  workflow-start handler already ends the owned jog before streaming the job.
- Manual page cycling during Running also avoids a jog stop.
- Android's controller adapter ignores late `jog:stop` and `jog:cancel` requests
  while a job workflow is Running. Normal and paused-workflow jog cancellation,
  job Stop, Pause, reset and E-stop commands retain their existing paths.

## Automatic passive logging

`runtime/job-recording.cjs` observes controller events and the existing transport.
It cannot command, pause, stop, reconnect or resume the CNC. Logging failures are
contained and must not interrupt the sender. Simulation sessions are excluded.

Each job starts a private `files/data/job-logs/<UUID>/` session with:

- Build, filename, size, command count, incremental SHA-256, firmware information,
  settings and initial machine/modal state.
- First 128 non-status transport observations, significant controller replies and
  realtime controls; rolling context of the most recent 64 non-status messages.
- Five-second sender/ACK counters, latest raw status (including buffer and spindle
  fields), workflow/hold state, queued bytes, Node memory, CPU and event-loop delay.
- Pendant samples: model/Android version, available memory, host PSS, WebView JS
  heap when available, viewport, recent preview diagnostic and RAF frame gaps.
- Pause/resume/stop requests, alarms/errors, disconnect or workflow end. Extended
  waits are recorded as observations, not diagnosed or automatically resumed.

Writes use asynchronous filesystem operations. Each job has an 8 MiB event cap
and a 256 KiB pending-write cap; omitted records are counted. Twelve sessions are
retained. Interrupted sessions are marked on restart. Export through **Tools →
Job logs → Export JSON**, using Android's existing save-file picker. Clearing app
data or uninstalling removes the private reports. File excerpts/settings are
local until the user exports them; no cloud upload occurs.

ACKs mean command acceptance, not completed axis movement. Workflow end alone is
not a successful-cut result. Frame gaps measure rendering opportunities, not
physical touch latency. Host PSS includes Node and excludes the isolated WebView
renderer; do not add it to Node RSS. Samples do not reconstruct missing Build 60
history. At most the current asynchronous batch / recent samples can be lost in
an abrupt process or power failure; writes are not fsync-per-command.

## New local benchmark case

Source: `Bottom_Skull 1 - Slice 3 & 4_03 - Finish 12.7mm BN.gcode`.
Original: 1,405,259 bytes; SHA-256
`e2ebb4706dbf6e4d1673b58e885619d00099dcb163975dd8adc705c72999e038`.

The original is preserved separately in the investigation archive. A simulator
copy prepends only the marker/comment and retains every original byte, including
G20 inch mode, feeds and spindle commands. Its 63,208 canonical commands (including
the marker) match checksum
`1a3683c5d4087ec2a376bcefa0e3bdd6946c59834e3ca0d740788a6d0cf1fff5`.
The simulator now honors G20/G21 and G90/G91 for reported positions. It remains a
paced command-throughput/viewport model, not a CNC planner or machining validator.
The full suite includes this case and its existing pan/zoom exercises when the
local fixture is present. No new tablet performance result is claimed.

The compressed job and manifest are Git-ignored under `benchmark/fixtures/local/`.
They will be copied into a future locally prepared payload, but not published in
Git or automatically available to CI. Re-create them on another build machine:

```sh
node android-port/scripts/import-job-fixture.cjs '/path/to/the/original-job.gcode'
```

The importer does not overwrite the source. It requires a terminating M2/M30 and
rejects manual tool changes. Public benchmark fixtures remain available when no
local file is present.

## Source validation

- 19 focused source tests passed: both real controller command methods, automatic
  and manual page transitions, normal jog cancellation, logging bounds, full/slow
  storage, restart recovery, simulation exclusion, UI sampling/export, transforms,
  existing spindle wheels and startup-disconnect regressions.
- 3 existing simulator/gate tests passed.
- The complete captured fixture passed an in-memory canonical-command checksum
  test with 63,208 acknowledgements. This was not a performance benchmark.
- These were the pre-build source checks. Build 61 packaging and K90 launch
  checks subsequently passed; physical job verification remains outstanding.


## Navigation and Z-height changes

Included in Build 61:

- Holding Home still opens the axis choices. Those choices now accept a normal
  tap, instead of silently requiring a second 500 ms hold. grblHAL uses its
  dedicated axis-homing command and lifecycle; legacy Grbl keeps `$HX` / `$HY` /
  `$HZ`, because its generic homing handler ignores axis arguments. Homing is
  unavailable during a running job, jogging or disconnection. If grblHAL has
  single-axis homing disabled in `$22`, the app explains that instead of changing
  EEPROM or accidentally starting a full homing cycle. This firmware requirement
  is checked by grblHAL's [go_home implementation](https://github.com/grblHAL/core/blob/master/system.c).
- Go To XY and individual Go To retain **G0**, including the existing safe retract
  and metric command context. The user's final instruction supersedes the earlier
  request to use Normal feed. No G1/feed substitution, rapid override change or
  controller rate-setting change was made.
- The visualizer's right-edge scale represents **Z only**: configured Z travel
  end marks, current Z in green, and the loaded toolpath's Z range in blue. Its
  height label is max Z minus min Z, including rapid/retract moves, not stock
  thickness. It is independent of the XY camera and does not intercept touches.
- With a job loaded the ruler uses work coordinates and translates configured
  machine travel using the live machine/work offset. Without a job it uses machine
  coordinates. Existing normalized millimetre state avoids converting G20 jobs
  twice; display units can still be inches. The scale accounts for the configured
  forced origin and Z homing direction. Disconnection removes the live marker and
  unplaceable machine range. Out-of-range values remain visible and turn orange;
  this display does not enforce soft limits or infer that the machine is homed.

Validation: eight focused tests passed for homing selection/routing, disabled
firmware settings, preserved G0 commands, work offsets, units, origin convention,
missing position and out-of-range Z values. The current source UI was checked in
an isolated browser with simulated state in portrait and landscape, dark/light
themes, unit switching, disconnection, and XY camera independence. Three existing
wheel/production-transform integration tests also passed. No machine
commands or physical homing test were performed. Hardware verification remains
on a physical machine with Build 61.


## Wheel increments

Feed and spindle override wheels now use 5% steps; the spindle's RPM wheel uses
500 RPM steps. The laser percentage wheel also uses 5%. Dragged values snap to
zero-anchored multiples within the controller's configured range. Manual entries
retain their exact permitted value until the wheel is moved; they do not shift
the wheel's scale. Keyboard arrows select the next mark in their direction, for
example 123% goes to 125% upward or 120% downward. Repeated pointer events within
the same mark do not resend a value-change update.

Four focused wheel tests passed, including real manual-entry/drag interactions
for percent and RPM, off-grid limits, interrupted gestures, disabled controls,
spindle override routing, and production UI transforms. These changes are
included in Build 61.


## Loaded-job statistics panel

The visualizer toolbar's filename/size/line summary is now a tap target with an
information icon. It opens a read-only, scrollable Job statistics dialog showing
estimated job time, file size (including exact bytes), line count, file type,
X/Y/Z toolpath bounds and A bounds when used, last programmed units, axes, tools,
programmed F/S ranges, and the number of flagged lines. Bounds include rapid and
retract moves and use normalized millimetre metadata converted to display units
only once. During the matching active/paused job it also shows elapsed time and
the sender's estimated remaining time. Estimates are identified as estimates;
missing values are shown as unavailable rather than invented.

The panel uses existing worker metadata; it does not reread, copy or parse the
G-code text. Detailed metadata and runtime subscriptions mount only while open.
Live status updates leave it open; unloading/replacing the file or processing a
new file closes it. It sends no CNC commands.

Validation: metadata formatting and mm/in/rotary conversion checks passed,
including a guard against accessing file content. Browser checks passed for tap
to open, live status updates, portrait/landscape layout, no horizontal overflow,
dark/light themes, close button, Escape and unload. Existing production wheel/UI
transform tests passed. Packaged checks and K90 launch passed in Build 61.
No commit or push was made.
