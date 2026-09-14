#!/usr/bin/env bash
# Build the Release iOS Simulator app the Appium suite drives (JS bundled, no Metro).
#
#   E2E_API_URL=http://localhost:3847/api/v1 e2e/scripts/build-ios.sh
#
# Output: mobile/ios/build/Build/Products/Release-iphonesimulator/mobile.app
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MOBILE="$ROOT/mobile"
API_URL="${E2E_API_URL:-http://localhost:3847/api/v1}"

cd "$MOBILE"
if [ ! -d ios ]; then
  # Generates ios/ (gitignored) and installs pods. Prebuild also rewrites the
  # `ios`/`android` npm scripts; restore them so the working tree stays clean.
  CI=1 npx expo prebuild -p ios
  git checkout -- package.json
fi

# Ad-hoc signing ("-") is required: an unsigned app has no keychain entitlement,
# so expo-secure-store silently fails and sessions never survive a relaunch.
EXPO_PUBLIC_API_BASE_URL="$API_URL" xcodebuild \
  -workspace ios/mobile.xcworkspace \
  -scheme mobile \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/build \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGN_STYLE=Manual \
  DEVELOPMENT_TEAM= | tail -n 5

APP="$MOBILE/ios/build/Build/Products/Release-iphonesimulator/mobile.app"
grep -aq "$API_URL" "$APP/main.jsbundle" || {
  echo "The bundle does not contain $API_URL" >&2
  exit 1
}
echo "Built $APP against $API_URL"
