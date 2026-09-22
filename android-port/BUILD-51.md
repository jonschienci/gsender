# Build 51 — cached bitmap toolpath preview

Built 2026-09-21 from the tested Build 47 source. No UI layout changes from other tasks are included. Backend, USB, Node 24.21.0 runtime and RAM-aware memory policy are unchanged.

- Replace preview PNG encode/decode with transferable ImageBitmap presentation in a canvas inside the existing SVG viewport. Geometry bounds, overlays and gesture handling are preserved.
- Reuse two bounded worker drawing surfaces. Reuse the displayed image while panning when its coverage and resolution are sufficient; zoom, resize, stroke changes or newly exposed geometry still request a redraw.
- Release stale/transferred images, cancel superseded renders, and invalidate the cache when presentation fails so the PNG compatibility retry cannot be skipped.
- Retain the 1,600-pixel image edge limit and bounded native stroke batches. Dense path rasterization stays on the worker's software canvas. Build 48's GPU canvas experiment caused a measured Lenovo input-dispatch ANR and was rejected; the WebView display remains hardware accelerated.
- Add opt-in preview draw/export timing and cache-hit events to the existing local benchmark logger. Normal launches do not emit these events or enable remote debugging.

Validation: 309 regression tests passed; both production frontends, Android release assemble/lint, compatible APK signing and payload/native-library verification passed. The final APK is `gSender-Android-build-51.apk`.

Device benchmark: six Lenovo TB-8506F workloads, 128 KiB–40 MiB, maintained approximately 500 simulated commands/s while panning without an observed crash/ANR or process restart. The contour and arc jobs finished with exact command checksums; the larger files were partial streaming samples. Cached images avoided repeated drawing, but active-job interaction timing did not materially improve. Progress/stop status still lagged, including a timeout waiting for the 20 MiB job's Running label to clear. Details and limits are recorded in [the Lenovo report](benchmarks/BUILD-51-LENOVO.md).

Build 51 remains installed on the Lenovo, relaunched with its normal settings after cleanup. K90 and physical USB/CNC behavior were not tested in this run. Intermediate builds 48–50 were experiments, not the recommended release.

APK SHA-256: `efd556b290593429e054d6bf83ef41da8eb6be83981ecb604814f330ed3266cb`.
