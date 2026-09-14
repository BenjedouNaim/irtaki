import { SEEDED, group, student } from '../../src/fixtures/builders.js';
import { launchLoggedOut, loginAs, openDeepLink, tap, waitVisible } from '../../src/support/app.js';
import { env } from '../../src/support/env.js';
import { byId } from '../../src/support/locators.js';
import { itKnownBug } from '../../src/support/known-issues.js';

/** docs/UF.md §7, §8, §26 — role shells and what each role must not reach (DEC-B09). */
describe('Role navigation', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 NAV-01 a Student gets Home · Progress · Payment tabs', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');

    for (const tab of ['home', 'progress', 'payment']) {
      await expect(byId(`student-tab-bar-${tab}`)).toBeDisplayed();
    }
    await tap('student-tab-bar-progress');
    await expect(byId('report-status-card')).not.toBeDisplayed();
    await tap('student-tab-bar-payment');
    await waitVisible('current-cycle-card');
    await tap('student-tab-bar-home');
    await waitVisible('report-status-card');
  });

  it('@P0 NAV-02 an Assistant has Home · Join requests · Payments and no reports or performance', async () => {
    const g = await group();
    await student(g);
    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');

    for (const tab of ['home', 'join-requests', 'payments']) {
      await expect(byId(`assistant-tab-bar-${tab}`)).toBeDisplayed();
    }
    for (const forbidden of ['report-status-card', 'week-card', 'group-performance', 'enrollment-toggle-button']) {
      await expect(byId(forbidden)).not.toBeExisting();
    }
  });

  it('@P0 NAV-02b an Assistant deep-linking into a student screen gets no student data', async () => {
    const g = await group();
    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');

    await openDeepLink('mobile://student/weekly-report');
    // The API refuses (DEC-B09): the screen shows the permission error, never metrics.
    await waitVisible('weekly-report-error-message', 30_000);
    await expect(byId('weekly-report-error-message')).toHaveText('ليس لديك صلاحية للوصول إلى هذا المورد');
    await expect(byId('metric-missed-daily-reports-value')).not.toBeExisting();
    await expect(byId('confirm-weekly-report-button')).not.toBeExisting();
  });

  itKnownBug(
    '@P1 NAV-02c the navigator sends an Assistant back Home instead of rendering student/teacher routes',
    'SA.md DEC-B09: "no reports/performance routes exist at all (enforced by the navigator, not just the API)"; deep links render the screens with a 403 banner',
    async () => {
      const g = await group();
      await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
      await openDeepLink('mobile://student/weekly-report');
      await waitVisible('assistant-home-top-bar', 15_000);
      await expect(byId('weekly-report-title')).not.toBeExisting();
    },
  );

  it('@P1 NAV-05 a signed-out deep link into the app lands on the login screen', async () => {
    await openDeepLink('mobile://admin/users');
    await waitVisible('login-submit-button', 30_000);
    await expect(byId('staff-users-list')).not.toBeExisting();
  });

  it('@P1 NAV-06 a signed-in Admin opening the login route is sent back to their Home', async () => {
    await loginAs(SEEDED.admin, env.seedPassword, 'Admin');
    await openDeepLink('mobile://login');
    await driver.pause(2_000);
    await waitVisible('admin-groups-button', 30_000);
  });
});
