#!/usr/bin/env bash
# Build the Release APK the Appium suite drives on an Android Emulator.
#
#   E2E_API_URL=http://10.0.2.2:3847/api/v1 e2e/scripts/build-android.sh
#
# 10.0.2.2 is the emulator's alias for the host machine. E2E_BUILD=1 makes
# mobile/app.config.ts allow cleartext HTTP, which Release builds otherwise block.
#
# Output: mobile/android/app/build/outputs/apk/release/app-release.apk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
API_URL="${E2E_API_URL:-http://10.0.2.2:3847/api/v1}"

cd "$MOBILE"
export E2E_BUILD=1
export EXPO_PUBLIC_API_BASE_URL="$API_URL"

CI=1 npx expo prebuild -p android --clean
git checkout -- package.json

cd android
./gradlew assembleRelease --no-daemon -q

APK="$MOBILE/android/app/build/outputs/apk/release/app-release.apk"
echo "Built $APK against $API_URL"
