# Irtaki mobile and web

Native notifications use Firebase Messaging on Android and iOS. React Native and
Expo remain the app framework; **Expo Push Service and EAS are not required**.
`expo-notifications` is used locally for permission requests, Android notification
channels, and foreground notification display; it does not send through Expo.
The web build does not load Firebase native modules or register push devices.

## Privacy policy

`public/privacy.html` is a standalone Arabic HTML page with an embedded icon.
Expo copies it into the web export, and the existing Nginx container serves it
directly at `https://irtaki.chrigui.dev/privacy`, without requiring sign-in.
The account-deletion instructions are at `/privacy#delete-account`.
Redeploy the web container after changing the page or Nginx configuration.

## Firebase setup

1. Add Firebase to your existing Google Cloud project if needed.
2. In Firebase Project settings → Your apps, register an **Android app** using
   your chosen Android application ID. Download its `google-services.json`.
3. Register an **iOS app** using your chosen bundle identifier. Download its
   `GoogleService-Info.plist`.
4. In Firebase Project settings → Cloud Messaging, upload your Apple APNs
   authentication key for iOS. Configure the corresponding app identifier and
   Push Notifications capability in your Apple Developer account/Xcode signing.
5. On the machine that builds the native app, supply the settings documented in
   `.env.example`:

| Variable | Value |
| --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Reachable backend API URL, including `/api/v1` |
| `ANDROID_APPLICATION_ID` | Exact package name registered in Firebase |
| `IOS_BUNDLE_IDENTIFIER` | Exact bundle identifier registered in Firebase/Apple |
| `FIREBASE_ANDROID_CONFIG` | Path to `google-services.json` |
| `FIREBASE_IOS_CONFIG` | Path to `GoogleService-Info.plist` |
| `IOS_APNS_ENVIRONMENT` | `development` for debug signing; `production` for distribution |

Paths may be absolute or relative to `mobile/`. Only the target platform's ID and
file are required to build that platform. No identifiers are invented by the app.
These are build settings; changing backend runtime environment values does not
reconfigure an already installed native app. Never put the service-account JSON
or Apple private key in the mobile environment or application bundle.

The backend's service-account JSON is configured separately using
[`backend/.env.example`](../backend/.env.example). Firebase config files for the
mobile apps are different from the private service-account key.

## Local builds without EAS

Use Node 22 and `npm ci` in `mobile/`. React Native Firebase is pinned to 23.5.0
for compatibility with this repository's Expo SDK 54 / Node 22 setup.
Expo UI is pinned to exactly `0.2.0-beta.9` for SDK 54 native compatibility.

Android requires the Android SDK/JDK tools and a supported device/emulator
with Google Play services. iOS requires macOS, Xcode, CocoaPods, and appropriate
Apple signing. For final notification verification, use physical devices.

```sh
npm run android
npm run ios
```

These commands validate the target platform's Firebase settings and run
`expo run:android` or `expo run:ios`, generating native projects locally.
Forward native CLI options with `npm run android -- --device` or
`npm run ios -- --device`. Use `npm start` for JavaScript iteration after the
native development build is installed. Expo Go does not contain Firebase native
modules and cannot run this integration. There is no EAS login or project setup.

The production API must be reachable by the device. `localhost` on a phone means
the phone itself; use your backend's HTTPS URL (or LAN address for local testing).
Generate a release build and configure app-store signing using the native
Android/Xcode tools; debug builds are not distribution artifacts.

### Signed Android bundle from the terminal

Run in `mobile/` after `npm ci` and the Firebase/environment setup above:

```sh
npm run release:android
```

The command loads the production environment, regenerates Android with Expo
prebuild, and builds an AAB signed by Gradle using your existing upload key.
Android Studio does not need to be open. It selects an installed nvm Node 22
and macOS JDK 21 when available; otherwise use Node 22 and set `JAVA_HOME` to
JDK 21 or 17. Install the Android SDK and set `ANDROID_HOME` for a custom location.

The final verified upload file is `dist/android/irtaki-<version>-<versionCode>.aab`.
It verifies the signature and selected upload certificate before replacing an
existing output, and rejects debug certificates. Back up your keystore outside Git.
For each subsequent Play upload, increase `expo.android.versionCode` in `app.json`;
the command does not increment it automatically.

Set these in your ignored local `.env` (CI can supply private environment secrets):

- `ANDROID_UPLOAD_KEYSTORE`: defaults to `~/Documents/irtaki-upload.jks`.
- `ANDROID_UPLOAD_KEY_ALIAS`: defaults to `irtaki-upload`.
- `ANDROID_UPLOAD_STORE_PASSWORD`: required; quote it and escape dollar signs as
  `\$` because Expo expands environment variables.
- `ANDROID_UPLOAD_KEY_PASSWORD`: leave blank if it matches the keystore password.

The command never prompts. Missing signing settings fail before prebuild.
Keep passwords private and never use an `EXPO_PUBLIC_` prefix for them.

Signing configuration lives outside the generated native directory so it survives
prebuild. Passwords are excluded from Expo prebuild and command arguments.

## Registration and notification behavior

After login, the app primes for push permission once per installation, requests
the system permission, obtains a native FCM token, and registers it with
`POST /devices`. It re-registers after token updates and on foreground/session
restoration. Permission can be enabled later in OS settings. Auto-initialization
is disabled before login/permission; logout removes the backend registration and
invalidates the native token on a best-effort basis. Account changes are serialized
so a late registration cannot stay attached to the previous account.

FCM notification+data messages display fixed generic Arabic text through the OS
while the app is backgrounded/closed. Foreground messages create one local alert.
Notification taps validate the event/identifier, refresh the authenticated session,
then follow UF §8's existing role/resource destinations. Push data never grants
access or changes a role. Acceptance/removal uses the role returned by the server;
notification data contains only `eventType` and `resourceId`.

All eight existing categories and mute rules remain. Delivery is best effort;
permission denial, OS restrictions, force-stop, or network/provider failures can
prevent display. There is no browser push or in-app notification history.

## Verification before release

- Run `npm run type-check`, `npm run lint`, and `npm test -- --runInBand --watchman=false`.
- Run `npm run check:native-config` to validate the actual Android/iOS config
  plugins with temporary public configuration fixtures; no real credentials or
  generated native projects are needed. CI runs this check too.
- Run `npx expo export --platform web` to check web remains independent of native Firebase.
- Build/install Android and iOS using the actual registered Firebase app files.
- Sign in, allow notifications, and confirm `/devices` registers a native FCM token.
- Trigger an existing notification and verify foreground, background, and cold-start
  display/tap behavior. Check generic lock-screen copy contains no personal data.
- Verify logout, account switching, permission changes, token refresh, and muted
  categories. Check `Sent` in the backend means FCM acceptance, not device display.

Baseline Expo transport/build references in `docs/` require a separate, explicitly
flagged documentation reconciliation; the approved direct-FCM transition is
recorded in the backend README.
