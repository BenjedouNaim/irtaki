/**
 * Interactive helper for writing specs: keeps one Appium session open across
 * invocations so you can look at a screen the way XCUITest/UiAutomator2 sees it.
 *
 *   appium --relaxed-security &                     # once
 *   npx tsx scripts/inspect.ts start ios             # create a session, launch the app
 *   npx tsx scripts/inspect.ts ids                   # testIDs + labels on screen
 *   npx tsx scripts/inspect.ts source out.xml        # full page source
 *   npx tsx scripts/inspect.ts run "await tap('login-submit-button')"
 *   npx tsx scripts/inspect.ts stop
 *
 * `run` evaluates async code with `driver`, `$`, `$$` and every helper from
 * src/support/{app,locators}.ts in scope.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { attach, remote } from 'webdriverio';
import * as app from '../src/support/app.js';
import * as locators from '../src/support/locators.js';
import * as gestures from '../src/support/gestures.js';

const SESSION_FILE = '.inspect-session.json';
const hostname = '127.0.0.1';
const port = Number(process.env.E2E_APPIUM_PORT ?? 4723);

interface Saved {
  sessionId: string;
  platform: 'ios' | 'android';
  capabilities: WebdriverIO.Capabilities;
}

async function connect(): Promise<WebdriverIO.Browser> {
  if (!existsSync(SESSION_FILE)) throw new Error('No session — run `start` first.');
  const saved = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as Saved;
  const browser = await attach({
    sessionId: saved.sessionId,
    hostname,
    port,
    capabilities: saved.capabilities,
    isW3C: true,
    isMobile: true,
    isIOS: saved.platform === 'ios',
    isAndroid: saved.platform === 'android',
    logLevel: 'warn',
  });
  browser.options.waitforTimeout = 15_000;
  expose(browser);
  return browser;
}

function expose(browser: WebdriverIO.Browser): void {
  Object.assign(globalThis, { driver: browser, browser, $: browser.$.bind(browser), $$: browser.$$.bind(browser) });
}

function summarize(xml: string): string {
  const lines: string[] = [];
  const re = /<(XCUIElementType\w+|[\w.]+)\s([^>]*?)\/?>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const attrs = Object.fromEntries(
      [...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]),
    );
    const id = attrs.name ?? attrs['resource-id'] ?? '';
    const label = attrs.label ?? attrs.text ?? attrs['content-desc'] ?? '';
    const value = attrs.value ?? '';
    if (attrs.visible === 'false' || attrs.displayed === 'false') continue;
    if (!id && !label) continue;
    const type = m[1].replace('XCUIElementType', '');
    const rect = attrs.x !== undefined ? ` @${attrs.x},${attrs.y} ${attrs.width}x${attrs.height}` : attrs.bounds ? ` ${attrs.bounds}` : '';
    lines.push(`${type.padEnd(14)} ${id ? `#${id}` : ''}${label && label !== id ? `  "${label}"` : ''}${value && value !== label ? `  =${value}` : ''}${rect}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'start': {
      const platform = arg === 'android' ? 'android' : 'ios';
      const mod = (await import(platform === 'ios' ? '../wdio.ios.conf.js' : '../wdio.android.conf.js')) as {
        config: WebdriverIO.Config;
      };
      const capabilities = (mod.config.capabilities as WebdriverIO.Capabilities[])[0];
      const browser = await remote({ hostname, port, capabilities, logLevel: 'warn', waitforTimeout: 15_000 });
      writeFileSync(
        SESSION_FILE,
        JSON.stringify({ sessionId: browser.sessionId, platform, capabilities: browser.capabilities } satisfies Saved),
      );
      expose(browser);
      await app.launchLoggedOut();
      console.log(`session ${browser.sessionId} (${platform}) — app on login screen`);
      break;
    }
    case 'ids': {
      const browser = await connect();
      console.log(summarize(await browser.getPageSource()));
      break;
    }
    case 'source': {
      const browser = await connect();
      writeFileSync(arg ?? 'page-source.xml', await browser.getPageSource());
      console.log(`wrote ${arg ?? 'page-source.xml'}`);
      break;
    }
    case 'run': {
      await connect();
      const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
        ...args: string[]
      ) => (...a: unknown[]) => Promise<unknown>;
      const scope = { ...app, ...locators, ...gestures };
      const fn = new AsyncFunction(...Object.keys(scope), arg ?? '');
      const out = await fn(...Object.values(scope));
      if (out !== undefined) console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
      break;
    }
    case 'shot': {
      const browser = await connect();
      await browser.saveScreenshot(arg ?? 'screen.png');
      console.log(`wrote ${arg ?? 'screen.png'}`);
      break;
    }
    case 'stop': {
      const browser = await connect();
      await browser.deleteSession();
      rmSync(SESSION_FILE, { force: true });
      console.log('session closed');
      break;
    }
    default:
      console.log('usage: inspect.ts start [ios|android] | ids | source [file] | shot [file] | run "<code>" | stop');
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
