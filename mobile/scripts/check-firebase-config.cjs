// Exercise the real native config plugins without credentials or generated native projects.
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { spawnSync } = require('node:child_process');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'irtaki-firebase-config-'));
try {
  const applicationId = 'com.example.irtaki.configtest';
  const androidConfig = join(fixtureRoot, 'google-services.json');
  const iosConfig = join(fixtureRoot, 'GoogleService-Info.plist');
  writeFileSync(androidConfig, JSON.stringify({
    project_info: { project_number: '123456789012', project_id: 'irtaki-config-test', storage_bucket: 'irtaki-config-test.appspot.com' },
    client: [{ client_info: { mobilesdk_app_id: '1:123456789012:android:1234567890abcdef', android_client_info: { package_name: applicationId } }, api_key: [{ current_key: 'config-test-placeholder' }] }],
    configuration_version: '1',
  }));
  writeFileSync(iosConfig, `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
    <key>GOOGLE_APP_ID</key><string>1:123456789012:ios:1234567890abcdef</string>
    <key>GCM_SENDER_ID</key><string>123456789012</string>
    <key>API_KEY</key><string>config-test-placeholder</string>
    <key>PROJECT_ID</key><string>irtaki-config-test</string>
    <key>BUNDLE_ID</key><string>${applicationId}</string>
    <key>PLIST_VERSION</key><string>1</string>
    </dict></plist>`);
  const cli = join(dirname(require.resolve('expo/package.json')), 'bin/cli');
  const result = spawnSync(process.execPath, [cli, 'config', '--type', 'introspect', '--json'], {
    cwd: join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, ANDROID_APPLICATION_ID: applicationId, IOS_BUNDLE_IDENTIFIER: applicationId,
      FIREBASE_ANDROID_CONFIG: androidConfig, FIREBASE_IOS_CONFIG: iosConfig, IOS_APNS_ENVIRONMENT: 'development' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Native Firebase config introspection failed; run expo config --type introspect for details.');
  }
  const config = JSON.parse(result.stdout);
  assert.equal(config.android.package, applicationId);
  assert.equal(config.ios.bundleIdentifier, applicationId);
  assert.equal(config.ios.entitlements['aps-environment'], 'development');
  assert.ok(config.plugins.includes('@react-native-firebase/app'));
  console.log('Android/iOS Firebase config plugins and APNs entitlement verified with temporary fixtures.');
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
