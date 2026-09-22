# Density-adaptive top-down preview

Included in Android Build 55. This applies to the pendant's top-down
toolpath layer; machine position, grid, origin and other SVG overlays stay live.
It does not modify G-code, job streaming, or the 3D renderer.

The existing preview worker now indexes the bounds of every 512-segment block
once per job. Viewport requests skip offscreen blocks, clip visible segments,
and estimate local line coverage in an 8 × 8 screen grid. Sparse views return
SVG paths with the original coordinates, colors and opacity. Dense views use
the existing software canvas and accelerated bitmap presentation, capped at
1600 pixels per edge. PNG presentation remains the compatibility fallback.

SVG entry is limited to 900 visible segments, 32 groups, 192 KiB of path text,
and an estimated peak grid-cell coverage of 0.65. An existing SVG view can stay
vector up to 1200 segments and coverage 1.0 to avoid rapid mode switching near
a threshold. These are conservative initial limits, not device-specific measured
optima. Density statistics include the decision reason and whether the scan
completed; early raster decisions report a lower bound on visible segments.

Panning and zooming recheck density even when a cached raster covers the new
view. Requests are throttled to 120 ms so long gestures and live position updates
cannot postpone redraw indefinitely. The previous layer remains displayed until
the replacement arrives. Obsolete worker results are discarded; pixel surfaces
are released on switching to SVG. The index shares worker geometry buffers and
adds approximately 32 bytes per 512 segments, excluding small per-group objects.

The renderer exposes `data-preview-mode` and `data-preview-reason` on its SVG.
Onboard benchmark preview events also include density decisions and worker
timings. Geometry and worker tests cover density transitions, clipping, fidelity,
bounded SVG output, cancellation, cache reuse and lifecycle cleanup; the adapter
test uses the real gviewer renderer. Build 55 tablet results are recorded in the
[performance report](benchmarks/gSender-Android-Build-55-Benchmark-Report.pdf).
K50/K90 completed the suite; Lenovo stopped on the 40 MiB preview at the memory
guard. All three recorded blank SVG frames before the Build 56 fix below.
Builds 56–57 have not been rebenchmarked.

Run from the repository with its Node environment:

```sh
node --test android-port/test/hybrid-geometry.test.cjs android-port/test/raster-preview.test.cjs android-port/test/raster-worker.test.cjs android-port/test/svg-interactions.test.cjs android-port/test/visualizer-performance.test.cjs
```

## Build 56 visible-area clipping fix

The SVG root uses `xMidYMid meet`. With a rectangular panel and a differently
shaped camera viewBox, extra world space remains visible beside or above that
viewBox. Build 55's worker culled and clipped only to the nominal viewBox, so
paths in that extra space could disappear permanently at a settled zoom. A
centered zoom into an outline-only fixture could therefore replace visibly
present side edges with an empty SVG layer. This was reproduced using the
packaged Build 55 contour job in local Chrome.

Build 56 expands preview requests to the complete visible world area
using the SVG's measured size and centered fit. Density analysis, clipping,
raster painting and cache coverage all use that same extent. A ResizeObserver
refreshes it after panel resizing or display rotation, including when the
camera viewBox itself is unchanged. Camera scale, G-code and motion are unchanged;
the 1600-pixel raster limit and existing SVG limits remain in place.

Validation: 18 focused geometry/worker/adapter tests passed. Real Chrome
screenshot pixel checks reproduced a blank toolpath before the fix and visible
edges afterward, for sparse SVG and dense raster jobs in both wide and tall
panels. Resizing without camera movement also passed. These are local regression
checks, not tablet performance results. The fix is included in Build 56;
the Build 55 benchmark report remains the last measured tablet baseline.

Additional regression test: `android-port/test/preview-viewport.test.cjs`.
