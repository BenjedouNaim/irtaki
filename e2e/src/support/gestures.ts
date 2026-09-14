import { byId } from './locators.js';

/** Item height of `shared/components/WheelPicker` (Figma 19:88). */
const WHEEL_ITEM_HEIGHT = 40;

/**
 * Value of the currently selected item of a WheelPicker. Selection is exposed
 * through `accessibilityState.selected` → iOS `value == "1"`, Android `selected`.
 */
export async function wheelSelectedValue(wheelId: string): Promise<string | undefined> {
  const prefix = `${wheelId}-item-`;
  const el = driver.isIOS
    ? $(`-ios predicate string:name BEGINSWITH "${prefix}" AND value == "1"`)
    : $(`android=new UiSelector().resourceIdMatches("^${prefix}.*").selected(true)`);
  if (!(await el.isExisting())) return undefined;
  const id = driver.isIOS ? await el.getAttribute('name') : await el.getAttribute('resource-id');
  return id?.slice(prefix.length);
}

async function dragVertically(x: number, fromY: number, toY: number): Promise<void> {
  // Slow move + pause before release: no fling, so the wheel snaps to where we stop.
  await driver
    .action('pointer', { parameters: { pointerType: 'touch' } })
    .move({ x: Math.round(x), y: Math.round(fromY) })
    .down()
    .pause(120)
    .move({ duration: 700, x: Math.round(x), y: Math.round(toY) })
    .pause(500)
    .up()
    .perform();
  await driver.pause(700);
}

/**
 * Select a numeric value on a WheelPicker by dragging it (item taps are
 * swallowed by the list's scroll responder inside sheets). Values must be
 * consecutive integers in item order: ayah numbers, hours, minutes.
 */
export async function selectWheelNumber(wheelId: string, target: number): Promise<void> {
  const wheel = byId(wheelId);
  await wheel.waitForDisplayed();
  const { x, y, width, height } = await wheel.getElementRect(await wheel.elementId);
  const cx = x + width / 2;
  const cy = y + height / 2;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = Number(await wheelSelectedValue(wheelId));
    if (current === target) return;
    const steps = Math.max(-5, Math.min(5, target - current));
    await dragVertically(cx, cy, cy - steps * WHEEL_ITEM_HEIGHT);
  }
  throw new Error(`${wheelId}: could not select ${target} (at ${await wheelSelectedValue(wheelId)})`);
}
