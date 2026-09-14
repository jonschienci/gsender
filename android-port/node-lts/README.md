# Upstream Node runtime prototype

This directory builds Node 24.21.0 from the official Node source archive, verified against the pinned SHA-256 in source.json. It does not download a Node.js Mobile binary. This is a feasibility prototype, not a supported Android Node distribution.

The Lenovo TB-8506F_GO used for testing exposes only armeabi-v7a/armeabi, so the first target is 32-bit ARM, Android API 26. Use Linux x86_64 with gcc-multilib and g++-multilib for 32-bit V8 snapshot tools. The attempted Apple Silicon build configured successfully but failed because the V8 ARM target requires a 32-bit host tool process; patching libuv's Mac source selection did not address that fundamental limitation.

The GitHub workflow android-node-lts.yml performs the runtime build on Ubuntu 24.04. It has read-only repository permissions, no signing credentials, and retains build logs and runtime artifacts for seven days. It does not publish an APK or release.

## Build the runtime

Requires Python 3.12+, curl, make, patch, GCC/G++ multilib and Android NDK 27.2.12479018.

```sh
python3 android-port/node-lts/build.py --ndk /path/to/ndk/27.2.12479018 --work /path/to/scratch --output /path/to/node-runtime --jobs 4
```

Keep work/output outside the source checkout. The output includes libnode.so, matching Node/V8/libuv headers, the upstream license and build provenance. OpenSSL assembly is disabled for this initial cross-build. Node startup snapshot and code cache are disabled; V8's own startup snapshot remains enabled. Measure startup time and memory before making this the default.

## Build the Android app against that runtime

Generate the usual backend, desktop, pendant and payload bundles first using the existing scripts. Then:

```sh
./android-port/gradlew -p android-port assembleDebug lintDebug -PnodeRuntimeRoot=/absolute/path/to/node-runtime -PnodeRuntimeAbis=armeabi-v7a
python3 android-port/scripts/verify-apk.py --abi armeabi-v7a --runtime-version 24.21.0
```

The explicit runtime path selects C++20 for the JNI bridge. No controller/backend rewrite is part of this experiment. Keep the existing signing key for in-place app updates. Build 17 is preserved in the previous APK and the haptic changes are checkpointed in git.

## Maintenance obligations

For each LTS update: pin the new source hash, review and reapply any Android patches, build on Linux, verify ELF architecture/dependencies and APK contents, run the backend regressions on that Node version, then run Android startup/USB/reconnect/background tests. Node does not officially support Android; the project owns these checks and the embedding integration. A passing desktop test suite is not proof of Android or physical CNC reliability.

## Smoke test without a controller

`probe.cjs` uses the existing simulated USB fixture; it never opens a physical USB device. Bundle it with esbuild for Node, put it beside `fake-native.cjs` and an extracted `runtime/` payload, and execute it with the standalone `launcher.cpp` linked against the new Android libnode. The probe checks the actual Node version and Android platform, HTTP authentication, pendant assets and three serial open/detach/reconnect cycles. Its `PROBE_PASS` result does not claim physical USB or full CNC job validation.

The standalone test runs only under adb shell in an isolated `/data/local/tmp` directory. The production app continues to use the existing Java service and JNI bridge; the test launcher is not shipped in the APK.

## Recorded compatibility patch

`linux-v8-arm-template.patch` adds two missing C++ `template` disambiguators in V8's 32-bit integer lowering code. The original error matches https://github.com/nodejs/node/issues/58458. This changes C++ parsing, not the generated operation's semantics. The initial unpatched Linux build failed at these two lines after compiling its dependencies. CI now saves a bounded compiler cache even when a build fails.

## JNI bridge smoke test

`jni-probe/` supplies an isolated Java entry point with the production JNI method names. Compile it with javac and Android d8, then run it under adb shell/app_process with the newly built `libgsender_bridge.so`, `libnode.so` and `libc++_shared.so`. The Java callback echoes messages into the real C++ bridge, checking delivery of ASCII, Unicode and an 8 KiB message. This test does not instantiate UsbManager or send motion commands; its classes are never included in the APK. A baseline run on the Lenovo passed with Node.js Mobile 18.20.4.

## Build 18 validation (2026-09-14)

GitHub Actions run https://github.com/jonschienci/gsender/actions/runs/34889402011 successfully built the runtime at commit cc762e222ecaaebfab31da054913ca86ebb9f36f. The first complete attempt exceeded its 90-minute limit; the successful retry used a 180-minute limit and targeted libnode only. The later progress logging and compiler-content cache check are diagnostics/cache improvements and were not part of that runtime artifact.

- The upstream library SHA-256 matches build-info.json. ELF32 ARM, SONAME libnode.so, only Android system libraries plus libc++_shared.so required.
- All 56 backend/USB regressions pass under Node 24.21.0 on macOS.
- Gradle assembleDebug and lintDebug pass. APK verification confirms Build 18's runtime provenance, packaged dependencies, ARM ABI and payload hash.
- The final APK's stripped native libraries pass the JNI echo test on the Lenovo TB-8506F_GO running Android 11.
- The final APK payload passes authenticated HTTP, pendant asset loading and three simulated serial open/detach/reconnect cycles under Node 24.21.0 on the Lenovo. The isolated probe changes only its HTTP port to 18765 to avoid the installed app.
- No app installation, physical SLB motion, sustained job, UI launch or lifecycle validation was performed for Build 18. Those hardware checks remain necessary before normal machine use.

Build 18 remains a prototype; upstream Node does not officially support Android. Updating the pinned runtime still requires maintaining the small Android build/embedding integration. It preserves the existing backend and requires neither Cordova nor Termux.
