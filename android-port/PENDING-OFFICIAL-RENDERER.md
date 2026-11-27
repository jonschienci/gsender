# Official renderer — pending next Android build

Implemented in source on 2026-11-27 at the user's request and committed for the
next Android build. No new APK was built or installed. Build 79 remains the
latest distributed custom build. This extends the [selected official updates](PENDING-UPSTREAM-2026-11-27.md).

## Renderer and retained UI

The pendant visualizer and generated-toolpath previews now use the actual
`GCodeViewer` WebGL implementation from **`@sienci/gviewer` 0.1.52**, matching
[official dev d141e293](https://github.com/Sienci-Labs/gsender/blob/d141e293e8794483b4d74cf37b2401ad5adfc6d5/src/pendant/src/components/Visualizer.tsx).
The package is exactly pinned; its downloaded tarball was verified against the
registry's SHA-512 integrity value. Existing top-view worker deduplication and
full job statistics are retained. Static geometry stays in GPU buffers.

The former SVG toolpath renderer, raster-preview worker and prototype patches
are no longer installed in the pendant drawing path. Small SVG overlays still
provide the custom coordinate readouts, machine/job boundaries, origin menu,
crosshair and spindle/laser indicator. The panel layout, Z ruler, framing,
position tracking, touch-to-move, jog/tilt/knob controls and USB transport remain
the custom implementation. Position-only updates move the overlay without
reloading geometry or drawing the toolpath again.

The official camera is locked top-down and orthographic, with damping disabled,
on-demand drawing and the official 30 FPS animation ceiling. This ceiling is
not a measured frame rate or a guarantee of tablet performance. The custom
marker remains an overlay rather than using the official marker animation.

`OfficialToolpathVisualizer.tsx` owns each viewer and disposes it on unmount.
`official-renderer.mjs` adapts its camera to the existing viewport API used by
framing, coordinate controls and onboard benchmarks. The adapter has one narrow
dependency on pinned viewer internals (camera, controls, scene and renderer),
guarded at initialization. A future gviewer upgrade must rerun the browser test.
Hidden previews defer fitting until visible. After WebGL context restoration,
the adapter reapplies the background colour before the official viewer redraws;
this fixed a black-background regression found during testing.

## Validation

- A real headless Chrome WebGL test passed using 40,000 segments. It checks GPU
  toolpath pixels, overlay/camera alignment, work-offset rebasing, pointer and
  keyboard origin actions, coordinate editing, mouse pan/wheel zoom, touch pan
  and pinch zoom, portrait resizing, hidden-tab loading, context recovery,
  benchmark output, idle drawing and cleanup. Twelve live position
  updates reused the same geometry and caused no additional GPU draws.
- 28 focused Node tests passed for worker geometry, arcs/helices/rotary paths,
  retained statistics, reconnect parsing, viewport bounds, Z scaling and onboard
  benchmark orchestration. The retired SVG 0.1.37 adapter test was skipped. The
  packaged onboard suite was excluded because the generated APK payload is not
  present; no Android build was made just to produce it.
- The full pendant web bundle compiled successfully (3,543 modules in the commit candidate). Vite still
  reports the existing large main-bundle warning. This was a web compile check,
  not an Android build.

The browser used software WebGL for repeatability. These checks establish
rendering behaviour, not hardware FPS, physical touch latency, GPU memory use
or CNC motion reliability. Test the next APK on the Lenovo and K90 with Skull
and Rexy, recording load time, memory, idle/streaming pan-and-zoom frame gaps and
context recovery. Full GPU geometry can use more memory than the previous
raster preview; no performance gain is claimed until those comparisons exist.
The shared gviewer dependency also serves desktop/3D paths, which were not
device-benchmarked in this integration.

Onboard rendering events retain `gsender-benchmark-preview`, now with mode
`official-webgl`, camera view, draw calls, line count and `cpuSubmitMs`.
`cpuSubmitMs` measures CPU submission only, not GPU completion. Logging is
enabled only during an active onboard benchmark.

## Integration artifacts

Before snapshots, an incremental patch, source hashes, a regression screenshot
and the compile output are in the Codex workspace under
`work/official-renderer-integration-20261127/`. The incremental patch is relative
to the working source immediately before this renderer change, including the
previous selected upstream integration. It does not stage or incorporate the
checkout's unrelated pending experiments. The local ignored `yarn.lock` was
refreshed to the verified version; the tracked dependency pin is in
`package.json`.
