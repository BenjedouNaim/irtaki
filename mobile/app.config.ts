import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest } from 'expo/config-plugins';

/**
 * `app.json` stays the source of truth; this only layers build-time switches on top.
 *
 * `E2E_BUILD=1` (e2e/scripts/build-android.sh): the Appium suite runs a Release
 * APK against a local HTTP API (`http://10.0.2.2:<port>`), which Android blocks
 * in Release builds unless cleartext traffic is allowed. Never set for store builds.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = config as ExpoConfig;
  if (process.env.E2E_BUILD !== '1') {
    return base;
  }
  return withAndroidManifest(base, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
