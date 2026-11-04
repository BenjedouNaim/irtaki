# Irtaki — Appium end-to-end suite

Drives the real mobile app (Release build, no Metro) against a real API and
Postgres, one spec file per feature area. Test IDs (`AUTH-04`, `DR-02`…) and
priorities (`@P0` smoke, `@P1`, `@P2`) follow the E2E test plan.

| Folder | What lives there |
|---|---|
| `specs/<area>/*.e2e.ts` | the tests |
| `src/fixtures/` | API client, SQL helpers (time travel), scheduled-job runner, scenario builders |
| `src/flows/` | multi-screen steps (join application, daily report form…) |
| `src/support/` | locators, taps/scrolling, iOS system prompts, wheel pickers |
| `scripts/` | build the app, start the API, `inspect.ts` for exploring screens |

## Run it locally (iOS Simulator)

Prerequisites: Xcode 26, Node 22+, Docker, `npm i -g appium && appium driver install xcuitest`.

```bash
# 1. API on :3847 against a dedicated database (keep this terminal open)
e2e/scripts/backend.sh

# 2. Build the app against that API
(cd mobile && npm ci) && e2e/scripts/build-ios.sh

# 3. Run
cd e2e && npm ci
npm run smoke:ios            # @P0 only
npm run test:ios             # everything
npx wdio run wdio.ios.conf.ts --spec specs/daily/daily-report.e2e.ts
```

Running Appium yourself (`appium --relaxed-security --port 4724`) keeps
WebDriverAgent warm between runs: add `E2E_APPIUM_EXTERNAL=1 E2E_APPIUM_PORT=4724`.

### Environment

| Variable | Default | Meaning |
|---|---|---|
| `E2E_API_URL` | `http://localhost:3847/api/v1` | API the app was built against (also used by fixtures) |
| `E2E_DB_*` | `localhost:5432`, `irtaki`/`irtaki`, `irtaki_e2e` | database for fixtures; `irtaki` is refused |
| `E2E_IOS_DEVICE` / `E2E_IOS_VERSION` | `iPhone 17` | simulator |
| `E2E_ANDROID_AVD` | – | emulator to boot |
| `E2E_INCLUDE_KNOWN=1` | off | also run `@known-bug` / `@known-gap` tests |
| `E2E_RETRIES` | `0` | Mocha retries per test |

## Android

```bash
E2E_API_URL=http://10.0.2.2:3847/api/v1 e2e/scripts/build-android.sh   # E2E_BUILD=1 allows cleartext HTTP
npm run smoke:android
```

The Android build script, config and CI job are written but have not been run
yet; the suite has only been verified on the iOS Simulator so far.

## How the suite deals with the hard parts

- **Test data** comes from the public API (`src/fixtures/builders.ts`): every
  group gets freshly promoted staff, every student is a real accepted join
  request, names carry a run id. SQL is only used to move time backwards
  (insert past reports, backdate a membership), since reports are immutable.
- **Time-based rules** (weekly finalisation, at-risk, reminders) run through
  `backend/src/cli/run-job.ts` with an explicit `--now` instead of waiting for a cron.
- **iOS quirks** handled in `src/support/app.ts`: taps at element centres
  (XCUITest's element tap misses some React Native pressables), the
  "Save Password?" alert and "Use Strong Password?" sheet, the keychain that
  survives reinstalls, RTL applied only on the second launch, and slow drag
  gestures for WheelPickers (item taps are swallowed inside sheets).
- **Known problems** are written as the specified behaviour and skipped with
  `itKnownBug` / `itKnownGap` until fixed.

## Exploring a screen

```bash
npx tsx scripts/inspect.ts start ios
npx tsx scripts/inspect.ts run "await loginAs('admin@irtaki.tn', 'password123', 'Admin')"
npx tsx scripts/inspect.ts ids        # testIDs, labels and frames on screen
npx tsx scripts/inspect.ts stop
```
