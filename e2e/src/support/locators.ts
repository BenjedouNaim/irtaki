import type { ChainablePromiseArray, ChainablePromiseElement } from 'webdriverio';

/**
 * Platform-aware lookup by React Native `testID`.
 *
 * - iOS: `testID` → accessibilityIdentifier → `~id`.
 * - Android: `testID` → resource-id (no package prefix) → UiSelector.
 *
 * iOS hides children of an `accessible` view (Pressable, Toggle, Checkbox,
 * CycleRow…) from XCUITest, so always target the pressable's own testID.
 * Never copy testIDs into accessibilityLabel: those are the Arabic
 * screen-reader labels.
 */
export function selectorFor(id: string): string {
  return driver.isIOS ? `~${id}` : `android=new UiSelector().resourceId("${id}")`;
}

export function byId(id: string): ChainablePromiseElement {
  return $(selectorFor(id));
}

/** Every element whose testID starts with `prefix` (e.g. `group-card-`). */
export function allByIdPrefix(prefix: string): ChainablePromiseArray {
  return driver.isIOS
    ? $$(`-ios predicate string:name BEGINSWITH "${prefix}"`)
    : $$(`android=new UiSelector().resourceIdMatches("^${escapeRegex(prefix)}.*")`);
}

/** An element whose visible text / label equals `text` exactly. */
export function byText(text: string): ChainablePromiseElement {
  return driver.isIOS
    ? $(`-ios predicate string:label == "${text}" OR value == "${text}"`)
    : $(`android=new UiSelector().text("${text}")`);
}

/** An element whose visible text / label contains `text`. */
export function byTextContains(text: string): ChainablePromiseElement {
  return driver.isIOS
    ? $(`-ios predicate string:label CONTAINS "${text}" OR value CONTAINS "${text}"`)
    : $(`android=new UiSelector().textContains("${text}")`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
