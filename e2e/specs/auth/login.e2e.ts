import { SEEDED, E2E_PASSWORD, uniqueEmail, user } from '../../src/fixtures/builders.js';
import { env } from '../../src/support/env.js';
import {
  HOME_MARKERS,
  dismissSystemPrompts,
  openDeepLink,
  scrollAndTap,
  waitVisible,
  fillLogin,
  launchLoggedOut,
  loginAs,
  logout,
  relaunch,
  tap,
  typeInto,
} from '../../src/support/app.js';
import { byId, byTextContains } from '../../src/support/locators.js';
import * as api from '../../src/fixtures/api.js';
import { insertPasswordResetToken, query } from '../../src/fixtures/db.js';

/** SCR-01/02 · UC-01 · docs/UF.md §9, §12 */
describe('Authentication', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  const roles = [
    { role: 'Admin', email: SEEDED.admin },
    { role: 'Teacher', email: SEEDED.teacherFemale },
    { role: 'Assistant', email: SEEDED.assistantFemale },
  ] as const;

  for (const { role, email } of roles) {
    it(`@P0 AUTH-04 logs a seeded ${role} into their Home`, async () => {
      await loginAs(email, env.seedPassword, role);
      await expect(byId(HOME_MARKERS[role])).toBeDisplayed();
    });
  }

  it('@P0 AUTH-04 logs a plain User into the User Home', async () => {
    const u = await user('login');
    await loginAs(u.email, u.password, 'User');
    await expect(byId('browse-groups-button')).toBeDisplayed();
  });

  it('@P1 AUTH-05 rejects a wrong password with one generic banner', async () => {
    await fillLogin(SEEDED.admin, 'wrong-password-123');
    await tap('login-submit-button');
    await expect(byId('login-general-error-message')).toHaveText(
      'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    );
    await expect(byId('admin-groups-button')).not.toBeExisting();
  });

  it('@P0 AUTH-01 registers a new account and lands on the User Home', async () => {
    const email = uniqueEmail('register');
    await tap('login-register-link');
    await typeInto('register-email-input', email);
    await typeInto('register-password-input', E2E_PASSWORD);
    await scrollAndTap('register-submit-button');
    await expect(byId('browse-groups-button')).toBeDisplayed({ wait: 30_000 });
    await dismissSystemPrompts({ waitMs: 5_000 });

    const rows = await query<{ role: string; timezone: string }>(
      'SELECT role, timezone FROM users WHERE email = $1',
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('User');
    expect(rows[0].timezone).toBe(env.timezone);
  });

  it('@P1 AUTH-03 refuses an email that is already registered', async () => {
    await tap('login-register-link');
    await typeInto('register-email-input', SEEDED.teacherMale);
    await typeInto('register-password-input', E2E_PASSWORD);
    await scrollAndTap('register-submit-button');
    // The server's Arabic message is shown inline on the email field (UF §24).
    await expect(byTextContains('البريد الإلكتروني مستخدم بالفعل')).toBeDisplayed({ wait: 15_000 });
    await expect(byId('browse-groups-button')).not.toBeExisting();
  });

  it('@P1 AUTH-06 restores the session on relaunch and AUTH-07 logs out', async () => {
    await loginAs(SEEDED.assistantMale, env.seedPassword, 'Assistant');
    await relaunch();
    await expect(byId(HOME_MARKERS.Assistant)).toBeDisplayed({ wait: 30_000 });

    await logout();
    await relaunch();
    await expect(byId('login-submit-button')).toBeDisplayed({ wait: 30_000 });
  });

  it('@P1 AUTH-08 a reset request shows the same neutral confirmation for any email', async () => {
    for (const email of [SEEDED.teacherMale, uniqueEmail('nobody')]) {
      await launchLoggedOut();
      await tap('login-forgot-password-link');
      await typeInto('forgot-password-email-input', email);
      await scrollAndTap('forgot-password-submit-button');
      await waitVisible('forgot-password-success-banner', 15_000);
    }
  });

  it('@P1 AUTH-09 a reset link sets a new password that signs in', async () => {
    const u = await user('reset');
    const token = await insertPasswordResetToken(u.id);
    const newPassword = 'Reset-pass-2026';

    await openDeepLink(`mobile://forgot-password-confirm?token=${token}`);
    // "done" submits the form (onSubmitEditing), like the button.
    await typeInto('forgot-password-confirm-password-input', `${newPassword}\n`);
    await waitVisible('login-success-banner', 15_000);

    await loginAs(u.email, newPassword, 'User');
    const oldRefused = await api.login(u.email, u.password).then(
      () => false,
      () => true,
    );
    expect(oldRefused).toBe(true);
  });

  it('@P1 AUTH-09b the link format the reset email actually sends opens the reset screen', async () => {
    const u = await user('reset-email-link');
    const token = await insertPasswordResetToken(u.id);

    // backend/src/modules/identity/infrastructure/mailgun-mailer.ts
    await openDeepLink(`mobile://(auth)/forgot-password-confirm?token=${encodeURIComponent(token)}`);
    await waitVisible('forgot-password-confirm-password-input', 15_000);
  });

  it('@P2 AUTH-10 an expired reset link shows the invalid-link state', async () => {
    const u = await user('reset-expired');
    const token = await insertPasswordResetToken(u.id, { expired: true });

    await openDeepLink(`mobile://forgot-password-confirm?token=${token}`);
    await typeInto('forgot-password-confirm-password-input', 'Another-pass-2026\n');
    await waitVisible('forgot-password-invalid-token-state', 15_000);
  });
});
