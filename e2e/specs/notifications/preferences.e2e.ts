import { group, student } from '../../src/fixtures/builders.js';
import { query } from '../../src/fixtures/db.js';
import { launchLoggedOut, loginAs, relaunch, scrollAndTap, scrollTo, tap, waitVisible } from '../../src/support/app.js';
import { byId } from '../../src/support/locators.js';

async function openPreferences(): Promise<void> {
  await tap('profile-button');
  await waitVisible('profile-top-bar');
  await scrollAndTap('profile-notification-preferences-row');
  await waitVisible('preference-row-N-01-toggle', 15_000);
}

async function mutedInDb(userId: string, category: string): Promise<boolean | undefined> {
  const rows = await query<{ muted: boolean }>(
    'SELECT muted FROM notification_preferences WHERE user_id = $1 AND category = $2',
    [userId, category],
  );
  return rows[0]?.muted;
}

/** SCR-34/35 · UC-18 · docs/UF.md §21 · VR-38 */
describe('Profile and notification preferences', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it("@P1 AUTH-13 the profile shows the account's email and name", async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await tap('profile-button');

    await waitVisible('profile-email-display');
    await expect(byId('profile-email-display')).toHaveText(expect.stringContaining(s.session.email));
    await expect(byId('profile-fullname-display')).toHaveText(expect.stringContaining(s.fullName));
  });

  it('@P1 NOT-01 muting a mutable category is saved and survives a relaunch', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await openPreferences();

    // The toggle is "on" when the category is muted.
    await expect(byId('preference-row-N-01-toggle')).toHaveAttribute('value', '0');
    await tap('preference-row-N-01-toggle');
    await expect(byId('preference-row-N-01-toggle')).toHaveAttribute('value', '1', { wait: 15_000 });
    await browser.waitUntil(async () => (await mutedInDb(s.session.id, 'N-01')) === true, {
      timeout: 15_000,
      timeoutMsg: 'N-01 was not saved as muted',
    });

    await relaunch();
    await waitVisible('student-home', 30_000);
    await openPreferences();
    await expect(byId('preference-row-N-01-toggle')).toHaveAttribute('value', '1');
  });

  it('@P1 NOT-01b account-critical notifications (N-03, N-04, N-08) cannot be muted', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await openPreferences();

    for (const category of ['N-03', 'N-04', 'N-08']) {
      await scrollTo(`preference-row-${category}`);
      await expect(byId(`preference-row-${category}-toggle`)).not.toBeExisting();
    }
  });
});
