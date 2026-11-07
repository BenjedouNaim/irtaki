const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { X509Certificate } = require('node:crypto');

const projectRoot = path.resolve(__dirname, '..');
const passwordVariables = ['ANDROID_UPLOAD_STORE_PASSWORD', 'ANDROID_UPLOAD_KEY_PASSWORD'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw new Error(`Cannot run ${path.basename(command)}: ${result.error.message}`);
  if (result.status !== 0) {
    // In particular, never include a signing command's environment in an error.
    throw new Error(`${path.basename(command)} failed (exit ${result.status ?? 'interrupted'}).`);
  }
  return result.stdout || '';
}

function javaHome() {
  const candidates = [process.env.JAVA_HOME];
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' });
    if (result.status === 0) candidates.unshift(result.stdout.trim());
  }
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(path.join(candidate, 'bin/java'), ['-version'], { encoding: 'utf8' });
    const major = Number((`${result.stderr}${result.stdout}`).match(/version "(\d+)/)?.[1]);
    if (result.status === 0 && [17, 21].includes(major)) return candidate;
  }
  throw new Error('Install JDK 21 (or 17), or set JAVA_HOME to its installation directory.');
}

function node22() {
  if (Number(process.versions.node.split('.')[0]) === 22) return process.execPath;
  const versionsRoot = path.join(process.env.NVM_DIR || path.join(os.homedir(), '.nvm'), 'versions/node');
  const candidates = fs.existsSync(versionsRoot)
    ? fs.readdirSync(versionsRoot).filter((name) => /^v22\./.test(name)).sort(
      (a, b) => b.localeCompare(a, undefined, { numeric: true }),
    ) : [];
  for (const version of candidates) {
    const executable = path.join(versionsRoot, version, 'bin/node');
    if (fs.existsSync(executable)) return executable;
  }
  throw new Error('Use Node 22 for this project (for example, nvm install 22 and nvm use 22).');
}

function archiveEntries(file, jdk) {
  return run(path.join(jdk, 'bin/jar'), ['tf', file]).split(/\r?\n/);
}

function verifyBundle(file, jdk, expectedFingerprint) {
  run(path.join(jdk, 'bin/jarsigner'), ['-verify', file]);
  const signatures = archiveEntries(file, jdk).filter((entry) => /^META-INF\/[^/]+\.SF$/i.test(entry));
  if (signatures.length !== 1) throw new Error('Expected exactly one bundle signer.');
  const pem = run(path.join(jdk, 'bin/keytool'), ['-printcert', '-rfc', '-jarfile', file]);
  const certificate = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  if (!certificate) throw new Error('No signing certificate found in the bundle.');
  const signer = new X509Certificate(certificate[0]);
  if (/\bCN\s*=\s*Android Debug\b/i.test(signer.subject)) {
    throw new Error('The bundle uses an Android debug certificate; refusing to publish this output.');
  }
  if (Date.parse(signer.validTo) <= Date.now()) throw new Error('The upload certificate has expired.');
  if (expectedFingerprint && signer.fingerprint256 !== expectedFingerprint) {
    throw new Error('The bundle signer does not match the selected upload key.');
  }
  return signer.fingerprint256;
}

function saveVerifiedBundle({ input, output, jdk, expectedFingerprint }) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(output), '.verified-'));
  try {
    const stagedBundle = path.join(staging, 'app.aab');
    fs.copyFileSync(input, stagedBundle);
    const fingerprint = verifyBundle(stagedBundle, jdk, expectedFingerprint);
    fs.renameSync(stagedBundle, output);
    return fingerprint;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function uploadFingerprint(jdk, keystore, alias, env) {
  const pem = run(path.join(jdk, 'bin/keytool'), ['-exportcert', '-rfc', '-keystore', keystore,
    '-alias', alias, '-storepass:env', 'ANDROID_UPLOAD_STORE_PASSWORD'], { env });
  return new X509Certificate(pem).fingerprint256;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length) {
    throw new Error('Usage: npm run release:android');
  }
  const selectedNode = node22();
  if (selectedNode !== process.execPath) {
    const result = spawnSync(selectedNode, [__filename, ...args], {
      stdio: 'inherit',
      env: { ...process.env, PATH: `${path.dirname(selectedNode)}${path.delimiter}${process.env.PATH || ''}` },
    });
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }

  process.env.NODE_ENV = 'production';
  require('@expo/env').load(projectRoot, { silent: true });
  const { exp } = require('@expo/config').getConfig(projectRoot);
  const applicationId = exp.android?.package;
  const firebaseFile = exp.android?.googleServicesFile;
  const versionCode = exp.android?.versionCode;
  const baseUrl = new URL(process.env.EXPO_PUBLIC_API_BASE_URL || '');
  if (baseUrl.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
    throw new Error('Set EXPO_PUBLIC_API_BASE_URL to your public HTTPS API URL in the mobile environment.');
  }
  if (!applicationId || !firebaseFile || !fs.existsSync(path.resolve(projectRoot, firebaseFile))) {
    throw new Error('Set ANDROID_APPLICATION_ID and FIREBASE_ANDROID_CONFIG in the mobile environment.');
  }
  const firebase = JSON.parse(fs.readFileSync(path.resolve(projectRoot, firebaseFile), 'utf8'));
  if (!firebase.client?.some((client) => client.client_info?.android_client_info?.package_name === applicationId)) {
    throw new Error('The Firebase file has no Android client matching ANDROID_APPLICATION_ID.');
  }
  if (!Number.isInteger(versionCode) || versionCode < 1) {
    throw new Error('Set a positive android.versionCode in app.json before building.');
  }
  const keystore = path.resolve(projectRoot,
    process.env.ANDROID_UPLOAD_KEYSTORE || path.join(os.homedir(), 'Documents/irtaki-upload.jks'));
  const alias = process.env.ANDROID_UPLOAD_KEY_ALIAS || 'irtaki-upload';
  if (!fs.existsSync(keystore)) {
    throw new Error('Upload keystore not found. Set ANDROID_UPLOAD_KEYSTORE to your existing .jks file.');
  }
  const jdk = javaHome();
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(),
    process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
  if (!fs.existsSync(sdk)) throw new Error('Android SDK not found. Set ANDROID_HOME to the SDK directory.');
  const buildEnv = { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, NODE_ENV: 'production',
    EXPO_NO_DOTENV: '1',
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}` };
  // Environment is already loaded. Prevent child Expo processes from reloading
  // signing passwords from .env after removing them here.
  passwordVariables.forEach((name) => delete buildEnv[name]);
  const signingEnv = { ...buildEnv, ANDROID_UPLOAD_KEYSTORE: keystore, ANDROID_UPLOAD_KEY_ALIAS: alias,
    ANDROID_UPLOAD_STORE_PASSWORD: process.env.ANDROID_UPLOAD_STORE_PASSWORD,
    ANDROID_UPLOAD_KEY_PASSWORD: process.env.ANDROID_UPLOAD_KEY_PASSWORD || process.env.ANDROID_UPLOAD_STORE_PASSWORD };
  if (!signingEnv.ANDROID_UPLOAD_STORE_PASSWORD) {
    throw new Error('Set ANDROID_UPLOAD_STORE_PASSWORD in mobile/.env before running this command.');
  }
  const expectedFingerprint = uploadFingerprint(jdk, keystore, alias, signingEnv);
  console.log(`Building ${applicationId} ${exp.version} (version code ${versionCode}) with Node 22.`);
  const expoCli = path.join(path.dirname(require.resolve('expo/package.json')), 'bin/cli');
  try {
    run(process.execPath, [expoCli, 'prebuild', '--platform', 'android', '--no-install'], {
      env: buildEnv, stdio: 'inherit',
    });
    run(path.join(projectRoot, 'android/gradlew'), [':app:bundleRelease', '--no-daemon',
      '--no-configuration-cache', '--console=plain', '--init-script',
      path.join(__dirname, 'android-release-signing.gradle')], {
      cwd: path.join(projectRoot, 'android'), env: signingEnv, stdio: 'inherit',
    });
  } finally { passwordVariables.forEach((name) => delete signingEnv[name]); }
  const input = path.join(projectRoot, 'android/app/build/outputs/bundle/release/app-release.aab');
  const output = path.join(projectRoot, 'dist/android', `irtaki-${exp.version}-${versionCode}.aab`);
  const fingerprint = saveVerifiedBundle({ input, output, jdk, expectedFingerprint });
  console.log(`\nVerified signed AAB: ${output}\nUpload certificate SHA-256: ${fingerprint}`);
}

module.exports = { javaHome, verifyBundle, saveVerifiedBundle, uploadFingerprint };
if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`\nAndroid release failed: ${error.message}`);
    process.exitCode = 1;
  }
}
