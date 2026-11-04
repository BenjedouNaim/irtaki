import path from 'node:path';
import { sharedConfig } from './wdio.shared.conf.js';
import { REPO_ROOT } from './src/support/env.js';
import { BUNDLE_ID } from './src/support/app.js';

/**
 * iOS Simulator run against a Release build (JS bundled, no Metro, no Expo Go).
 * Build it with `e2e/scripts/build-ios.sh`; see e2e/README.md.
 */
export const config: WebdriverIO.Config = {
  ...sharedConfig,
  capabilities: [
    ({
      platformName: 'iOS',
      'appium:automationName': 'XCUITest',
      'appium:deviceName': process.env.E2E_IOS_DEVICE ?? 'iPhone 17',
      ...(process.env.E2E_IOS_VERSION
        ? { 'appium:platformVersion': process.env.E2E_IOS_VERSION }
        : {}),
      'appium:app':
        process.env.E2E_IOS_APP ??
        path.join(REPO_ROOT, 'mobile/ios/build/Build/Products/Release-iphonesimulator/mobile.app'),
      'appium:bundleId': BUNDLE_ID,
      // Each spec launches the app itself after clearing the keychain (support/app.ts).
      'appium:autoLaunch': false,
      'appium:noReset': true,
      // Always install the build under test, even if another build is already on the device.
      'appium:enforceAppInstall': true,
      'appium:newCommandTimeout': 300,
      'appium:wdaLaunchTimeout': 300_000,
      'appium:wdaStartupRetries': 2,
      'appium:simulatorStartupTimeout': 300_000,
      'appium:reduceMotion': true,
      // Safety net for iOS's late "Save Password?" alert (support/app.ts also dismisses it
      // explicitly); the app itself never shows UIAlerts — its dialogs are RN modals.
      'appium:autoDismissAlerts': true,
      // React Native controlled inputs drop characters when XCUITest types at full speed.
      'appium:maxTypingFrequency': 12,
      'appium:keyboardAutocorrection': false,
      'appium:keyboardPrediction': false,
      'appium:appTimeZone': 'Africa/Tunis',
    }) as WebdriverIO.Capabilities,
  ],
};
