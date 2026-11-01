const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { load } = require('@expo/env');

load(process.cwd());
const platform = process.argv[2];
if (!['android', 'ios'].includes(platform))
  throw new Error('Specify android or ios');
const idKey =
  platform === 'android' ? 'ANDROID_APPLICATION_ID' : 'IOS_BUNDLE_IDENTIFIER';
const fileKey =
  platform === 'android' ? 'FIREBASE_ANDROID_CONFIG' : 'FIREBASE_IOS_CONFIG';
if (
  !process.env[idKey] ||
  !process.env[fileKey] ||
  !existsSync(process.env[fileKey])
) {
  console.error(
    `Native FCM build requires ${idKey} and ${fileKey} pointing to the Firebase app configuration. See mobile/README.md.`,
  );
  process.exit(1);
}
const result = spawnSync(
  'npx',
  ['expo', `run:${platform}`, ...process.argv.slice(3)],
  { stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
