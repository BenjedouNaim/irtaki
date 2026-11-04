import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { closeDb } from './src/fixtures/db.js';

const logsDir = path.resolve('./logs');
mkdirSync(path.join(logsDir, 'screenshots'), { recursive: true });

/**
 * `E2E_APPIUM_EXTERNAL=1` reuses an Appium server you already started
 * (`appium --relaxed-security`), which keeps WebDriverAgent warm between runs.
 * Otherwise the Appium service starts and stops one per run.
 */
const externalAppium = process.env.E2E_APPIUM_EXTERNAL === '1';

export const sharedConfig: WebdriverIO.Config = {
  runner: 'local',
  tsConfigPath: './tsconfig.json',
  specs: ['./specs/**/*.e2e.ts'],
  maxInstances: 1,
  capabilities: [],
  logLevel: 'warn',
  outputDir: logsDir,
  bail: 0,
  waitforTimeout: 15_000,
  waitforInterval: 250,
  connectionRetryTimeout: 300_000,
  connectionRetryCount: 1,
  hostname: '127.0.0.1',
  port: Number(process.env.E2E_APPIUM_PORT ?? 4723),
  services: externalAppium
    ? []
    : [
        [
          'appium',
          {
            command: 'appium',
            args: { relaxedSecurity: true, log: path.join(logsDir, 'appium.log') },
          },
        ],
      ],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 300_000,
    retries: Number(process.env.E2E_RETRIES ?? 0),
  },

  /** Install the build under test once per spec file, replacing any older build on the device. */
  before: async (capabilities) => {
    if (driver.isIOS) {
      // XCTest otherwise waits (up to 10s) for the app to be idle before every
      // command; React Native's animations and timers keep it "busy".
      await driver.updateSettings({ waitForIdleTimeout: 0, animationCoolOffTimeout: 0 });
    }
    const caps = capabilities as WebdriverIO.Capabilities & { 'appium:app'?: string };
    if (caps['appium:app'] && process.env.E2E_SKIP_INSTALL !== '1') {
      await driver.installApp(caps['appium:app']);
    }
  },

  afterTest: async (test, _context, { passed }) => {
    if (passed) return;
    const name = `${test.parent} ${test.title}`.replace(/[^\w@-]+/g, '_').slice(0, 150);
    await driver.saveScreenshot(path.join(logsDir, 'screenshots', `${name}.png`)).catch(() => {});
  },

  after: async () => {
    await closeDb();
  },
};
