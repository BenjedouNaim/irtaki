/** Firebase files and application identifiers belong to the app's Firebase registrations. */
module.exports = ({ config }) => {
  const androidId = process.env.ANDROID_APPLICATION_ID;
  const iosId = process.env.IOS_BUNDLE_IDENTIFIER;
  const androidFile = process.env.FIREBASE_ANDROID_CONFIG;
  const iosFile = process.env.FIREBASE_IOS_CONFIG;
  const firebaseConfigured = Boolean(androidFile || iosFile);
  return {
    ...config,
    android: {
      ...config.android,
      ...(androidId ? { package: androidId } : {}),
      ...(androidFile ? { googleServicesFile: androidFile } : {}),
    },
    ios: {
      ...config.ios,
      ...(iosId ? { bundleIdentifier: iosId } : {}),
      ...(iosFile ? { googleServicesFile: iosFile } : {}),
      ...(iosFile
        ? {
            entitlements: {
              ...config.ios?.entitlements,
              'aps-environment':
                process.env.IOS_APNS_ENVIRONMENT || 'development',
            },
          }
        : {}),
    },
    plugins: [
      ...(config.plugins || []).filter(
        (plugin) =>
          (Array.isArray(plugin) ? plugin[0] : plugin) !==
          'expo-build-properties',
      ),
      ['expo-notifications', { defaultChannel: 'irtaki' }],
      ...(firebaseConfigured ? ['@react-native-firebase/app'] : []),
      ['expo-build-properties', { ios: { useFrameworks: 'static' } }],
    ],
  };
};
