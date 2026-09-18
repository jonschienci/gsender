# Build 39

Version: `1.6.4-android.39-node24-prototype`.

- Pendant landscape view uses the full available height for the DRO above the jog controls, beside a slightly narrower visualizer. Portrait keeps the visualizer above the DRO/jog row.
- The jog-mode switch sits at the upper-left of its card without visible labels. Precise/Normal/Rapid buttons are narrower, with larger gaps and more vertical padding. Jog controls have additional spacing; buttons stay square and the XY pad stays circular.
- The workspace selector sits at the DRO's upper-left. Work/Machine is a rectangular, internally labeled switch at the upper-right, using the existing blue selection color. Axis values stay centered; Home, Go to XY and Zero All align beneath their corresponding columns.
- Status beside Unlock expands/collapses the existing modal readouts and pin lights. The chevron to the right of Config shows the full lower control tray or hides it completely; the last selected tray tab is retained.
- Start, Pause and Stop form a vertical rail beside the visualizer. The feed override retains its thicker slider with added padding.
- Existing USB/knob handling, jog press-and-hold behavior, haptics, Precise rim steps and center-drag recovery are retained. No knob firmware update is needed.

Layout verification uses the compiled interface at 1280 × 740 landscape and 800 × 1220 portrait against a simulated CNC. Physical tablet/CNC feel remains for the user to confirm. Build 39 is provided as a USB-installable update; development does not install it or command a physical machine.

## Verification

- All 260 Android-port/USB regression tests passed. A separate test against the finished APK passed regular-jog transitions, standalone XY jogging and automatic-knob handover with a simulated controller.
- Main and pendant frontend builds, release assembly and Android lint passed.
- APK runtime/payload verification passed for Node 24.21.0, armeabi-v7a. Both interfaces display Build 39, and the packaged native launcher is present. No preview bootstrap or test payload is included.
- The release APK is non-debuggable and retains the signing certificate used by Build 38, so `adb install -r` can update the existing app.
- Browser checks verified both tablet orientations, additional button spacing, Work/Machine alignment at the upper-right of the DRO, and the expanded Status tray fitting the landscape stack.
