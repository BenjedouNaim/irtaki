import { byId, selectorFor } from './locators.js';

export const BUNDLE_ID = 'tn.irtaki.mobile';

/** The first element each role's Home renders (docs/UF.md §26, SCR-05/08/17/22/26). */
export const HOME_MARKERS = {
  Admin: 'admin-groups-button',
  Teacher: 'teacher-top-bar',
  Assistant: 'assistant-home-top-bar',
  Student: 'student-home',
  User: 'user-stack-top-bar',
} as const;

export type HomeRole = keyof typeof HOME_MARKERS;

let launchedOnce = false;

/**
 * Start the app logged out, in RTL.
 *
 * - The refresh token lives in the iOS keychain (expo-secure-store), which
 *   survives reinstalls, so the keychain is cleared first.
 * - `I18nManager.forceRTL(true)` only takes effect on the next launch, so the
 *   first launch of a session is followed by a relaunch.
 */
export async function launchLoggedOut(): Promise<void> {
  await driver.terminateApp(BUNDLE_ID).catch(() => {});
  if (driver.isIOS) {
    await driver.execute('mobile: clearKeychains');
  } else {
    await driver.execute('mobile: clearApp', { appId: BUNDLE_ID });
  }
  await driver.activateApp(BUNDLE_ID);
  if (!launchedOnce) {
    launchedOnce = true;
    await byId('login-submit-button').waitForDisplayed({ timeout: 60_000 });
    await driver.terminateApp(BUNDLE_ID);
    await driver.activateApp(BUNDLE_ID);
  }
  await byId('login-submit-button').waitForDisplayed({ timeout: 60_000 });
}

/** Terminate and relaunch, keeping the stored session. */
export async function relaunch(): Promise<void> {
  await driver.terminateApp(BUNDLE_ID);
  await driver.activateApp(BUNDLE_ID);
}

export async function typeInto(testId: string, value: string): Promise<void> {
  const el = byId(testId);
  await el.waitForExist();
  await dismissSystemPrompts();
  await scrollTo(testId);
  await tapElement(await el.getElement());
  if (driver.isIOS && (await el.getAttribute('type')) === 'XCUIElementTypeSecureTextField') {
    await dismissSystemPrompts({ waitMs: 1_000, strongPassword: true });
  }
  await el.clearValue();
  await el.setValue(value);
}

/**
 * Tap an element at its centre. On iOS, XCUITest's element tap sometimes lands
 * nowhere on React Native pressables (its hit point is computed from the
 * accessibility frame), while a coordinate tap at the centre is reliable.
 */
export async function tapElement(el: WebdriverIO.Element): Promise<void> {
  if (!driver.isIOS) {
    await el.click();
    return;
  }
  const r = await driver.getElementRect(await el.elementId);
  await driver.execute('mobile: tap', {
    x: Math.round(r.x + r.width / 2),
    y: Math.round(r.y + r.height / 2),
  });
}

/**
 * Wait until `testId` is displayed, dismissing iOS system prompts while
 * waiting — a late "Save Password?" alert hides the whole app from XCUITest.
 */
export async function waitVisible(
  testId: string,
  timeout = 20_000,
  opts: { settleMs?: number } = {},
): Promise<WebdriverIO.Element> {
  const el = byId(testId);
  const deadline = Date.now() + timeout;
  for (let polls = 0; ; polls += 1) {
    if (await el.isDisplayed().catch(() => false)) {
      // Just appeared: let a modal fade or a sheet slide finish before acting on it.
      if (polls > 0 && opts.settleMs) await driver.pause(opts.settleMs);
      return el.getElement();
    }
    await dismissSystemPrompts();
    if (Date.now() > deadline) {
      throw new Error(`element ("${testId}") still not displayed after ${timeout}ms`);
    }
    await driver.pause(400);
  }
}

export async function tap(testId: string, timeout?: number): Promise<void> {
  await tapElement(await waitVisible(testId, timeout, { settleMs: 450 }));
}

/**
 * Hide the software keyboard without pressing its return key (which would fire
 * `onSubmitEditing`, e.g. submit the login form; numeric pads have none).
 * Tapping a non-interactive element — `tapOutsideId`, or the screen's top-bar
 * title — lets the ScrollView dismiss the keyboard.
 */
export async function dismissKeyboard(tapOutsideId?: string): Promise<void> {
  if (!(await driver.isKeyboardShown().catch(() => false))) return;
  if (!driver.isIOS) {
    await driver.hideKeyboard().catch(() => {});
    return;
  }
  const target = tapOutsideId
    ? byId(tapOutsideId)
    : $('-ios predicate string:name ENDSWITH "-top-bar-title"');
  if (await target.isExisting()) {
    await tapElement(await target.getElement()).catch(() => {});
  }
  await driver.pause(400);
}

/** Fill SCR-01 without submitting. */
export async function fillLogin(email: string, password: string): Promise<void> {
  await typeInto('login-email-input', email);
  await typeInto('login-password-input', password);
}

const NOT_NOW_BUTTON =
  '-ios predicate string:type == "XCUIElementTypeButton" AND (label == "Not Now" OR label == "ليس الآن")';

/**
 * iOS system UI that covers the app on signed builds:
 * - "Save Password?" alert after a sign-in (sometimes, ~0.5s after navigation);
 * - "Use Strong Password?" sheet when a `newPassword` field gains focus.
 * Returns whether something was dismissed. `waitMs` keeps polling for a prompt
 * that is about to appear; 0 is a single cheap check.
 */
export async function dismissSystemPrompts(
  opts: { waitMs?: number; strongPassword?: boolean } = {},
): Promise<boolean> {
  if (!driver.isIOS) return false;
  const deadline = Date.now() + (opts.waitMs ?? 0);
  for (;;) {
    const alertShown = await driver.getAlertText().then(
      () => true,
      () => false,
    );
    if (alertShown) {
      // appium:autoDismissAlerts may close it first; a vanished button means it is gone.
      const notNow = await $$(NOT_NOW_BUTTON).getElements();
      if (notNow.length > 0) {
        await notNow[0].click().catch(() => {});
      } else {
        await driver.execute('mobile: alert', { action: 'dismiss' }).catch(() => {});
      }
      await driver.pause(600);
      return true;
    }
    if (opts.strongPassword && (await $('~GenerateStrongPasswordButton').isExisting())) {
      await $('-ios predicate string:name == "xmark" OR label == "Close"').click();
      await driver.pause(600);
      return true;
    }
    if (Date.now() >= deadline) return false;
    await driver.pause(300);
  }
}

/** Log in through SCR-01 (password field's "done" submits) and wait for the role's Home. */
export async function loginAs(email: string, password: string, role: HomeRole): Promise<void> {
  await typeInto('login-email-input', email);
  await typeInto('login-password-input', `${password}\n`);
  await waitVisible(HOME_MARKERS[role], 30_000);
  // The save-password alert shows up anywhere from ~0.5s to ~4s after sign-in, or not at all.
  await dismissSystemPrompts({ waitMs: 4_000 });
}

/**
 * Confirm a `Dialog` (`<id>-confirm-button`). RN modals fade in; a tap during
 * the fade is dropped, so wait for it to settle and retry while the dialog is
 * still open. A tap that did register disables the button while the request
 * runs, so a retry can never submit twice.
 */
export async function confirmDialog(dialogId: string): Promise<void> {
  const confirm = `${dialogId}-confirm-button`;
  await waitVisible(confirm);
  await driver.pause(700);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const button = await $$(selectorFor(confirm)).getElements();
    if (button.length === 0) return;
    await tapElement(button[0]);
    const closed = await byId(confirm)
      .waitForExist({ reverse: true, timeout: 5_000 })
      .then(
        () => true,
        () => false,
      );
    if (closed) return;
  }
  throw new Error(`${dialogId} is still open after confirming`);
}

/** Log out from any role's Home (the logout button sits at the bottom of each Home). */
export async function logout(): Promise<void> {
  await scrollTo('logout-button');
  await tap('logout-button');
  await byId('login-submit-button').waitForDisplayed({ timeout: 30_000 });
}

export async function openDeepLink(url: string): Promise<void> {
  if (driver.isIOS) {
    await driver.execute('mobile: deepLink', { url, bundleId: BUNDLE_ID });
  } else {
    await driver.execute('mobile: deepLink', { url, package: BUNDLE_ID });
  }
}

let windowSize: { width: number; height: number } | undefined;

type Rect = { x: number; y: number; width: number; height: number };

/** One lookup: the element's rect, or undefined when it is not in the tree. */
async function rectOf(testId: string): Promise<Rect | undefined> {
  const found = await $$(selectorFor(testId)).getElements();
  if (found.length === 0) return undefined;
  return driver.getElementRect(found[0].elementId);
}

/** Top of the software keyboard, or undefined when none is shown. */
async function keyboardTop(): Promise<number | undefined> {
  if (!driver.isIOS || !(await driver.isKeyboardShown())) return undefined;
  const keyboard = await $$('-ios class chain:**/XCUIElementTypeKeyboard').getElements();
  if (keyboard.length === 0) return undefined;
  return (await driver.getElementRect(keyboard[0].elementId)).y;
}

function fitsViewport(r: Rect, bottom: number): boolean {
  return r.height > 0 && r.y >= 110 && r.y + r.height <= bottom;
}

/**
 * Whether the element's rect lies inside the visible window. XCUITest reports
 * `visible=true` for ScrollView children that are scrolled off-screen, so
 * `isDisplayed()` alone cannot tell whether a tap would land.
 */
export async function isInViewport(testId: string): Promise<boolean> {
  const r = await rectOf(testId);
  if (!r) return false;
  windowSize ??= await driver.getWindowSize();
  const kb = await keyboardTop();
  return fitsViewport(r, Math.min(windowSize.height - 24, kb ?? Infinity));
}

/** Scroll vertically until `testId` is fully on screen, then let the scroll settle. */
export async function scrollTo(testId: string, maxSwipes = 12): Promise<void> {
  windowSize ??= await driver.getWindowSize();
  // Lists load asynchronously; swiping before the rows exist scrolls blindly.
  await byId(testId)
    .waitForExist({ timeout: 5_000 })
    .catch(() => {});
  for (let i = 0; i < maxSwipes; i += 1) {
    const r = await rectOf(testId);
    const kb = await keyboardTop();
    const visibleBottom = Math.min(windowSize.height - 24, kb ?? Infinity);
    if (r && fitsViewport(r, visibleBottom)) {
      if (i > 0) await driver.pause(300);
      return;
    }
    const bottom = Math.min(windowSize.height * 0.8, (kb ?? Infinity) - 30);
    const top = Math.max(windowSize.height * 0.2, 140);
    const up = !r || r.y + r.height > bottom; // content is below → swipe up
    // Move exactly as far as needed (capped), slowly, so momentum doesn't overshoot.
    const needed = !r ? 300 : up ? r.y + r.height - bottom + 40 : top - r.y + 40;
    const distance = Math.max(80, Math.min(needed, bottom - top));
    const x = Math.round(windowSize.width / 2);
    const from = Math.round(up ? bottom : top);
    const to = Math.round(up ? bottom - distance : top + distance);
    await driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x, y: from })
      .down()
      .pause(100)
      .move({ duration: 700, x, y: to })
      .pause(350)
      .up()
      .perform();
    await driver.pause(300);
  }
  throw new Error(`scrollTo: ${testId} never came into view`);
}

/** Scroll to an element and tap it. */
export async function scrollAndTap(testId: string): Promise<void> {
  await dismissSystemPrompts();
  await dismissKeyboard();
  await scrollTo(testId);
  await tapElement(await byId(testId).getElement());
}
