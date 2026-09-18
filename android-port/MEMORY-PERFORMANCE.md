# Memory policy and large-job storage

**Build 46 update:** The ARM32 memory policy and indexed sender are built and tested on K90. See [Build 46](BUILD-46.md) for final APK results and limits. The ARM64 runtime remains unbuilt/unvalidated; the earlier host-only measurements below are retained for context.

The requested baseline is a **1.5 GiB application planning allowance**, not a reservation and not a maximum for the whole app. Larger tablets scale up with RAM. Android still decides which allocations it can satisfy and may terminate processes under pressure. There is no API that gives an app unlimited RAM or guarantees a minimum allocation.

## Backend budget

The native launcher reads physical RAM through libuv. It leaves 25% (at least 512 MiB on supported tablets) for Android and other apps. It assigns two thirds of the remaining allowance to V8 old-space, rounded down to 64 MiB. The rest is headroom for native buffers, Java, young-generation GC and WebView. These are planning proportions, not separately enforced partitions. Startup logs under `gSenderMemory` and the linked bridge's `memoryBudget()` report the actual selection.

| OS-reported physical RAM | App planning allowance | V8 old-space, ARM64 | V8 old-space, ARM32 |
| --- | --- | --- | --- |
| 2 GiB | 1.5 GiB | 1 GiB | 1 GiB |
| 4 GiB | 3 GiB | 2 GiB | 1.5 GiB |
| 8 GiB | 6 GiB | 4 GiB | 1.5 GiB |

OS-reported usable RAM is usually less than the advertised capacity; actual selections will differ. Below 2 GiB, the allowance scales down rather than assuming nonexistent memory. The budget is calculated at process startup and is a ceiling, not an eager allocation. Brief changes in free memory do not continually resize the heap or interrupt an active job.

The 32-bit heap ceiling preserves address space for native buffers, stacks and libraries. Build 45 uses a 32-bit runtime even on K50/K90. More physical RAM cannot remove that address-space limitation. The ARM64 workflow and packaging changes must be built and validated before compatible tablets can use the larger 64-bit budget. The Lenovo keeps the ARM32 runtime.

The Java `largeHeap` manifest flag would not raise Node's or WebView's heap ceiling and is not part of this change. Existing foreground-service behavior and bounded USB/control queues remain in place. Benchmark force-stop guards are external test settings, not an app memory limit.

## Lower-allocation sender

The Android backend adapter replaces Sender's retained array of line strings with a chunked index into the original G-code. Each nonblank line needs eight bytes of offsets. A command is sliced when it is sent. Line numbering, trimming, filtering, buffered commands, hold/resume, start-from-line and rewind preserve the upstream sender's behavior. Unload/replacement drops references to the index and original text; normal garbage collection reclaims them.

This does not yet change the file upload, preview geometry, estimator or other copies of the job. It is not a claim that a 100 MiB file can now run on the tablet.

Host-only Node 24.21.0 microbenchmark on 2026-09-18, one measurement per case:

| Synthetic input | Lines | Previous line storage | Indexed line storage | Previous/indexed load time |
| --- | --- | --- | --- | --- |
| 20 MiB | 566,797 | 26.1 MiB | 4.4 MiB | 129 / 15 ms |
| 100 MiB | 2,833,989 | 130.6 MiB | 21.7 MiB | 222 / 54 ms |

Memory above excludes the original file and other app components. The complete trimmed command streams matched SHA-256 checksums. Deferring string slicing adds work during streaming: the host hash-and-read phase measured 88 / 165 ms for 20 MiB and 309 / 330 ms for 100 MiB (old / new). These isolated timings are sensitive to JIT/GC and are not tablet throughput measurements. The Build 46 K90 comparison now covers the ARM32 implementation; see its release notes.

## Validation and remaining checks

Initial source-only validation (before Build 46):

- Native policy tests for 32/64-bit processes and 512 MiB–64 GiB RAM.
- Android NDK ARM32 syntax check of the actual JNI bridge, using the existing Node 24 headers.
- Sender tests against the original implementation for both protocols, Unicode whitespace, chunk boundaries, filtering, hold/resume, start line, rewind and replacement/unload.
- Runtime compiler-configuration and artifact merge tests, including wrong ELF architecture, missing ABI, mismatched sources and corrupt libraries.
- Workflow YAML parse and backward-compatible APK verifier check against the existing Build 45 APK.
- Offline Gradle configuration check (`help` task only), including automatic selection of the currently available ARM32 runtime.

Build 46 subsequently passed release assembly/lint, APK checks, the isolated ARM32 JNI memory probe and the K90 simulated-job comparison. Remaining: compile and validate the ARM64 runtime, test USB hardware and other tablets, and run larger-file and endurance qualification. No UI design changes were incorporated.

```sh
node --test android-port/test/job-memory.test.cjs
clang++ -std=c++17 android-port/test/memory-budget.test.cpp -o /tmp/gsender-memory-test
/tmp/gsender-memory-test
python3 -B -m unittest discover -s android-port/node-lts -p test_runtime.py -v
node android-port/benchmarks/line-memory.cjs 100
```

References: [Android memory management](https://developer.android.com/topic/performance/memory/manage-app-memory) and [Node's V8 heap option](https://nodejs.org/api/cli.html#--max-old-space-sizesize-in-mib). V8 old-space does not include all memory used by Node or the Android app.
