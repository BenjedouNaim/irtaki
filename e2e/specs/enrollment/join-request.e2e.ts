import * as api from '../../src/fixtures/api.js';
import { applicant, group, staff, user } from '../../src/fixtures/builders.js';
import { notificationLog, query } from '../../src/fixtures/db.js';
import { chooseGroup, fillApplication, openGroupList, submitApplication } from '../../src/flows/enrollment.js';
import { confirmDialog, launchLoggedOut, loginAs, relaunch, scrollAndTap, tap, waitVisible } from '../../src/support/app.js';
import { itKnownBug } from '../../src/support/known-issues.js';
import { allByIdPrefix, byId } from '../../src/support/locators.js';

/** SCR-05/06/07 (User) · SCR-17/18/19 (Assistant) · UC-03, UC-04 · docs/UF.md §11, §13 */
describe('Enrollment — apply and decide', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 ENR-01 a User applies to an open group of their gender and the request is Pending', async () => {
    const female = await group({ gender: 'Female' });
    const male = await group({ gender: 'Male' });
    const u = await user('apply');

    await loginAs(u.email, u.password, 'User');
    await openGroupList('Female');

    // Only same-gender, Open, Active groups are offered (UF §13).
    await expect(byId(`group-card-${female.id}`)).toBeExisting();
    await expect(byId(`group-card-${male.id}`)).not.toBeExisting();

    await chooseGroup(female.id);
    await fillApplication({ fullName: 'مريم التجربة' });
    await submitApplication();

    const rows = await query<{ status: string; group_id: string }>(
      'SELECT jr.status, jr.group_id FROM join_requests jr JOIN users u ON u.id = jr.user_id WHERE u.email = $1',
      [u.email],
    );
    expect(rows).toEqual([{ status: 'Pending', group_id: female.id }]);

    // A fresh launch shows the Pending card and hides "browse groups" (UF §10).
    await relaunch();
    await waitVisible('join-request-status-card', 30_000);
    await expect(byId('join-request-status-badge')).toHaveText(expect.stringContaining('قيد المراجعة'));
    await expect(byId('browse-groups-button')).not.toBeExisting();
  });

  itKnownBug(
    '@P1 ENR-01b the User Home shows the Pending request right after submitting',
    'User Home keeps the "no request / browse groups" card until the app is relaunched',
    async () => {
      const g = await group({ gender: 'Female' });
      const u = await user('apply-refresh');
      await loginAs(u.email, u.password, 'User');
      await openGroupList('Female');
      await chooseGroup(g.id);
      await fillApplication({ fullName: 'نور التحديث' });
      await submitApplication();
      await expect(byId('join-request-status-card')).toBeDisplayed({ wait: 10_000 });
      await expect(byId('browse-groups-button')).not.toBeExisting();
    },
  );

  it('@P1 ENR-02 closed and archived groups are not offered', async () => {
    const s = await staff();
    const closed = await group({ gender: 'Female', open: false });
    const archived = await group({ gender: 'Female' });
    await api.setLifecycle(s.admin.token, archived.id, 'Archived');
    const open = await group({ gender: 'Female' });
    const u = await user('discovery');

    await loginAs(u.email, u.password, 'User');
    await openGroupList('Female');

    await expect(byId(`group-card-${open.id}`)).toBeExisting();
    await expect(byId(`group-card-${closed.id}`)).not.toBeExisting();
    await expect(byId(`group-card-${archived.id}`)).not.toBeExisting();
  });

  it('@P1 ENR-04 the submit button stays disabled until the profile is valid (min 5 ahzab, fee)', async () => {
    const g = await group({ gender: 'Female' });
    const u = await user('validation');

    await loginAs(u.email, u.password, 'User');
    await openGroupList('Female');
    await chooseGroup(g.id);
    await fillApplication({ fullName: 'سارة التحقق', ahzab: [1, 2, 3, 4], feeAgreement: false });

    await expect(byId('ahzab-counter')).toHaveText(expect.stringContaining('4'));
    await expect(byId('submit-application-button')).not.toBeEnabled();

    await scrollAndTap('ahzab-chip-5');
    await expect(byId('submit-application-button')).not.toBeEnabled();

    await scrollAndTap('fee-agreement-checkbox');
    await expect(byId('submit-application-button')).toBeEnabled();
  });

  it('@P1 ENR-05 choosing "revision only" shows the block notice', async () => {
    const g = await group({ gender: 'Female' });
    const u = await user('revision-goal');

    await loginAs(u.email, u.password, 'User');
    await openGroupList('Female');
    await chooseGroup(g.id);
    await scrollAndTap('goal-revision');

    await expect(byId('revision-block-notice')).toBeDisplayed();
  });

  it('@P0 ENR-09 the Assistant queue is ordered by Applicant Score, highest first', async () => {
    const g = await group({ gender: 'Female' });
    const low = await applicant(g, { ahzab: [1, 2, 3, 4, 5], tajweedLevel: 'Beginner', studiedTajweedTheory: false, studiedQalun: false });
    const high = await applicant(g, { ahzab: Array.from({ length: 40 }, (_, i) => i + 1), tajweedLevel: 'Advanced' });
    expect(high.score).toBeGreaterThan(low.score);

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-join-requests');
    await byId(`join-request-row-${high.joinRequestId}`).waitForExist();

    const rows = await allByIdPrefix('join-request-row-');
    const ids: string[] = [];
    for (const row of rows) {
      const name = await row.getAttribute(driver.isIOS ? 'name' : 'resource-id');
      ids.push((name ?? '').replace('join-request-row-', ''));
    }
    expect(ids.indexOf(high.joinRequestId)).toBeLessThan(ids.indexOf(low.joinRequestId));
    await expect(byId(`join-request-score-${high.joinRequestId}`)).toHaveText(high.score.toFixed(2));
  });

  it('@P0 ENR-10 accepting a request makes the applicant a Student', async () => {
    const g = await group({ gender: 'Female' });
    const a = await applicant(g, { fullName: 'هاجر المقبولة' });

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-join-requests');
    await tap(`join-request-row-${a.joinRequestId}`);

    // Contact details are shown, the email is not (UF §14).
    await expect(byId('applicant-full-name')).toHaveText('هاجر المقبولة');
    await expect(byId('field-phone')).toBeExisting();
    await expect(byId('applicant-detail-content')).not.toHaveText(expect.stringContaining(a.session.email));

    await scrollAndTap('accept-join-request-button');
    await confirmDialog('accept-confirm-dialog');
    await byId('join-requests-queue-screen').waitForDisplayed({ timeout: 30_000 });

    const rows = await query<{ status: string }>('SELECT status FROM join_requests WHERE id = $1', [a.joinRequestId]);
    expect(rows[0].status).toBe('Accepted');
    expect(await notificationLog(a.session.id, 'N-03')).toHaveLength(1);

    // The applicant's next launch lands on Student Home.
    await launchLoggedOut();
    await loginAs(a.session.email, a.session.password, 'Student');
    await expect(byId('home-header-membership')).toHaveText(expect.stringContaining(g.name));
  });

  itKnownBug(
    '@P1 ENR-10b the queue drops the accepted request immediately',
    'accepted row and Home pending tile stay stale until the tab is re-focused',
    async () => {
      const g = await group({ gender: 'Female' });
      const a = await applicant(g);

      await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
      await tap('assistant-tab-bar-join-requests');
      await tap(`join-request-row-${a.joinRequestId}`);
      await scrollAndTap('accept-join-request-button');
      await confirmDialog('accept-confirm-dialog');
      await byId('join-requests-queue-screen').waitForDisplayed({ timeout: 30_000 });

      await expect(byId(`join-request-row-${a.joinRequestId}`)).not.toBeExisting({ wait: 5_000 });
    },
  );

  it('@P0 ENR-11 rejecting a request shows Rejected and "apply again" to the applicant', async () => {
    const g = await group({ gender: 'Female' });
    const a = await applicant(g);

    await loginAs(g.assistant.email, g.assistant.password, 'Assistant');
    await tap('assistant-tab-bar-join-requests');
    await tap(`join-request-row-${a.joinRequestId}`);
    await scrollAndTap('reject-join-request-button');
    await confirmDialog('reject-confirm-dialog');
    await byId('join-requests-queue-screen').waitForDisplayed({ timeout: 30_000 });
    expect(await notificationLog(a.session.id, 'N-04')).toHaveLength(1);

    await launchLoggedOut();
    await loginAs(a.session.email, a.session.password, 'User');
    await waitVisible('apply-again-button');
  });

  it('@P1 ENR-13 archiving a group auto-rejects its pending requests', async () => {
    const s = await staff();
    const g = await group({ gender: 'Female' });
    const a = await applicant(g);
    await api.setLifecycle(s.admin.token, g.id, 'Archived');

    await loginAs(a.session.email, a.session.password, 'User');
    await waitVisible('apply-again-button');

    // Un-archiving does not revive the request.
    await api.setLifecycle(s.admin.token, g.id, 'Active');
    await relaunch();
    await expect(byId('apply-again-button')).toBeDisplayed({ wait: 30_000 });
  });
});
