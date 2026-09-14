import path from 'node:path';
import { sharedConfig } from './wdio.shared.conf.js';
import { REPO_ROOT } from './src/support/env.js';
import { BUNDLE_ID } from './src/support/app.js';

/**
 * Android Emulator run against a Release APK built with
 * EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:<port>/api/v1 and cleartext allowed
 * (`E2E_BUILD=1`, see mobile/app.config.ts). Build it with `e2e/scripts/build-android.sh`.
 *
 * React Native puts `testID` into `resource-id` without a package prefix, so id
 * autocompletion must be off for the locator helper to match it.
 */
export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    ({
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:deviceName': process.env.E2E_ANDROID_DEVICE ?? 'Android Emulator',
      ...(process.env.E2E_ANDROID_AVD ? { 'appium:avd': process.env.E2E_ANDROID_AVD } : {}),
      'appium:app':
        process.env.E2E_ANDROID_APP ??
        path.join(REPO_ROOT, 'mobile/android/app/build/outputs/apk/release/app-release.apk'),
      'appium:appPackage': BUNDLE_ID,
      'appium:appActivity': '.MainActivity',
      'appium:autoLaunch': false,
      'appium:noReset': true,
      // Always install the build under test, even if another build is already on the device.
      'appium:enforceAppInstall': true,
      'appium:autoGrantPermissions': true,
      'appium:disableIdLocatorAutocompletion': true,
      'appium:newCommandTimeout': 300,
      'appium:uiautomator2ServerLaunchTimeout': 120_000,
      'appium:adbExecTimeout': 120_000,
    }) as WebdriverIO.Capabilities,
  ],
};
