import { scrollAndTap, tap, waitVisible } from '../support/app.js';
import { selectWheelNumber } from '../support/gestures.js';
import { byId } from '../support/locators.js';

/**
 * SCR-10/11 building blocks: the Quran range sheet and the time-window sheet
 * (`features/dailyReports/components/{QuranRangeField,TimeWindowField}.tsx`).
 */

export interface Position {
  surah: number;
  ayah: number;
}

type RangeField = 'memo-range-field' | 'rev-range-field';
type TimeField = 'memo-time-field' | 'rev-time-field';

/** Pick `from → to` in a Quran range field. Keep surahs near the top of the list (1–10). */
export async function pickRange(field: RangeField, from: Position, to: Position): Promise<void> {
  const sheet = `${field}-sheet`;
  await scrollAndTap(`${field}-trigger`);
  await chooseSurah(`${sheet}-from`, from.surah);
  await selectWheelNumber(`${sheet}-from-ayah-wheel-picker`, from.ayah);
  await tap(`${sheet}-next-button`);
  await chooseSurah(`${sheet}-to`, to.surah);
  await selectWheelNumber(`${sheet}-to-ayah-wheel-picker`, to.ayah);
  await tap(`${sheet}-confirm-button`);
  await byId(`${sheet}-confirm-button`).waitForExist({ reverse: true });
}

/**
 * Tap a surah once its list has settled (the sheet slides in, and a tap during
 * the animation selects the row without advancing), then wait for the ayah wheel.
 */
async function chooseSurah(step: string, surah: number): Promise<void> {
  await waitVisible(`${step}-surah-list-search-input`);
  await driver.pause(600);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await tap(`surah-row-${surah}`);
    if (await byId(`${step}-ayah-wheel-picker`).waitForDisplayed({ timeout: 5_000 }).catch(() => false)) {
      await driver.pause(400);
      return;
    }
  }
  await waitVisible(`${step}-ayah-wheel-picker`);
}

/** Set one end of a time window. Values near the picker's default (18:00) keep this fast. */
export async function pickTime(
  field: TimeField,
  end: 'from' | 'to',
  hour: number,
  minute: number,
): Promise<void> {
  await scrollAndTap(`${field}-${end}`);
  await selectWheelNumber(`${field}-hour-wheel`, hour);
  await selectWheelNumber(`${field}-minute-wheel`, minute);
  await tap(`${field}-confirm-button`);
  await byId(`${field}-confirm-button`).waitForExist({ reverse: true });
}

/** Open SCR-09 from Student Home and choose a report type (SCR-10 opens). */
export async function startReport(type: 'normal' | 'revision' | 'absent'): Promise<void> {
  await tap('submit-report-button');
  await tap(`report-type-card-${type}`);
  await waitVisible('daily-report-form-top-bar-title');
}

/** Answer a Yes/No segmented question (`<id>-yes` / `<id>-no`). */
export async function answer(questionId: string, yes: boolean): Promise<void> {
  await scrollAndTap(`${questionId}-${yes ? 'yes' : 'no'}`);
}

export async function submitReport(): Promise<void> {
  await scrollAndTap('submit-report-button');
}

/** Whether a radio/segment option is selected (`accessibilityState.selected`). */
export async function isSelected(testId: string): Promise<boolean> {
  return (await byId(testId).getAttribute('selected')) === 'true';
}
