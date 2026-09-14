import { dismissKeyboard, scrollAndTap, tap, typeInto, waitVisible } from '../support/app.js';
import { byId } from '../support/locators.js';
import type { Gender } from '../fixtures/api.js';

/** SCR-06 profile answers; defaults describe an eligible applicant. */
export interface ApplicationForm {
  fullName: string;
  age?: string;
  phone?: string;
  occupation?: string;
  city?: string;
  ahzab?: number[];
  tajweed?: 'Beginner' | 'Intermediate' | 'Advanced';
  theory?: boolean;
  qalun?: boolean;
  goal?: 'memorization' | 'revision';
  feeAgreement?: boolean;
}

/** SCR-05 → SCR-06 step 1 → step 2 (the eligible group list). */
export async function openGroupList(gender: Gender): Promise<void> {
  await tap('browse-groups-button');
  await tap(gender === 'Male' ? 'gender-male-option' : 'gender-female-option');
  await tap('step1-submit-button');
  await byId('step2-groups').waitForExist();
}

/** Step 2 → SCR-07 sheet → step 3. */
export async function chooseGroup(groupId: string): Promise<void> {
  await scrollAndTap(`group-card-${groupId}`);
  await tap('apply-group-button');
  await byId('input-full-name').waitForExist();
}

/** Fill step 3 without submitting. */
export async function fillApplication(form: ApplicationForm): Promise<void> {
  await typeInto('input-full-name', form.fullName);
  await typeInto('input-age', form.age ?? '24');
  await typeInto('input-phone-number', form.phone ?? '22123456');
  await typeInto('input-occupation', form.occupation ?? 'مهندسة');
  await typeInto('input-city', form.city ?? 'المنستير');
  await dismissKeyboard();
  for (const hizb of form.ahzab ?? [1, 2, 3, 4, 5]) {
    await scrollAndTap(`ahzab-chip-${hizb}`);
  }
  await scrollAndTap(`tajweed-option-${form.tajweed ?? 'Intermediate'}`);
  await scrollAndTap(`theory-${(form.theory ?? true) ? 'yes' : 'no'}`);
  await scrollAndTap(`qalun-${(form.qalun ?? true) ? 'yes' : 'no'}`);
  await scrollAndTap(`goal-${form.goal ?? 'memorization'}`);
  if (form.feeAgreement ?? true) {
    await scrollAndTap('fee-agreement-checkbox');
  }
}

/** Submit step 3; the stepper closes back to the User Home. */
export async function submitApplication(): Promise<void> {
  await scrollAndTap('submit-application-button');
  await waitVisible('user-stack-top-bar', 30_000);
  await byId('submit-application-button').waitForExist({ reverse: true, timeout: 30_000 });
}
