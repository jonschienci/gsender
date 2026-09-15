#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
node android-port/scripts/build-backend.cjs
node node_modules/vite/bin/vite.js build --config android-port/vite.config.mjs
GSENDER_ANDROID_UI=pendant node node_modules/vite/bin/vite.js build --config android-port/vite.config.mjs
python3 android-port/scripts/package-payload.py
node --test --test-concurrency=1 android-port/test/*.test.cjs android-port/usb/test/*.test.cjs
./android-port/gradlew -p android-port assembleRelease lintRelease --console=plain
python3 android-port/scripts/verify-apk.py --apk android-port/app/build/outputs/apk/release/app-release.apk
