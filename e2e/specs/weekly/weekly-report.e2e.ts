import * as api from '../../src/fixtures/api.js';
import { group, student, type StudentFixture } from '../../src/fixtures/builders.js';
import { insertDailyReport, query } from '../../src/fixtures/db.js';
import { runJob } from '../../src/fixtures/jobs.js';
import { answer } from '../../src/flows/daily.js';
import { launchLoggedOut, loginAs, relaunch, scrollAndTap, tap } from '../../src/support/app.js';
import { byId } from '../../src/support/locators.js';
import { addDays, isoWeekday, localDate, notToday } from '../../src/support/time.js';

/**
 * A student whose recitation day is today, with the six previous days of the
 * week covering every daily-report shape the weekly metrics distinguish.
 */
async function studentOnRecitationDay(): Promise<StudentFixture> {
  const today = localDate();
  const s = await student(await group({ recitationDay: isoWeekday() }), {
    startedAt: addDays(today, -10),
  });
  await insertDailyReport(s.membershipId, { date: addDays(today, -6), type: 'Normal' });
  await insertDailyReport(s.membershipId, { date: addDays(today, -5), type: 'Normal', completed50: false });
  // addDays(today, -4): no report at all
  await insertDailyReport(s.membershipId, { date: addDays(today, -3), type: 'Absent', absenceReason: 'Other' });
  await insertDailyReport(s.membershipId, { date: addDays(today, -2), type: 'Absent', absenceReason: 'Sick' });
  await insertDailyReport(s.membershipId, { date: addDays(today, -1), type: 'Revision' });
  return s;
}

const METRICS = [
  ['metric-missed-daily-reports-value', 'missed_daily_reports'],
  ['metric-missed-daily-memorization-value', 'missed_daily_memorization'],
  ['metric-missed-daily-revision-value', 'missed_daily_revision'],
  ['metric-missed-50-repetitions-value', 'missed_50_repetitions'],
  ['metric-missed-single-session-value', 'missed_single_session'],
] as const;

/** SCR-12 · UC-06 · J3 · docs/UF.md §16 · TS §22 */
describe('Weekly report', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 WR-02 shows the week\'s metrics as the server computed them', async () => {
    const s = await studentOnRecitationDay();
    const live = await api.currentWeeklyReport(s.session.token);
    // The one day without any report is counted once as a missed report (BR-23);
    // the excused absence (Sick) is not a missed report.
    expect(live.expected_days).toBe(6);
    expect(live.missed_daily_reports).toBe(1);

    await loginAs(s.session.email, s.session.password, 'Student');
    await tap('weekly-report-button');
    await expect(byId('weekly-report-expected-days')).toHaveText(expect.stringContaining('6'));
    for (const [testId, field] of METRICS) {
      await expect(byId(testId)).toHaveText(String(live[field]));
    }
  });

  it('@P0 WR-01 the student confirms attendance once; the week is then read-only', async () => {
    const s = await studentOnRecitationDay();
    await loginAs(s.session.email, s.session.password, 'Student');
    await tap('weekly-report-button');

    // No default answer, and confirming needs one.
    await expect(byId('attended-toggle-yes')).toHaveAttribute('selected', 'false');
    await expect(byId('attended-toggle-no')).toHaveAttribute('selected', 'false');
    await expect(byId('confirm-weekly-report-button')).not.toBeEnabled();

    await answer('attended-toggle', true);
    await scrollAndTap('confirm-weekly-report-button');
    await expect(byId('confirm-weekly-report-button')).not.toBeExisting({ wait: 30_000 });

    const rows = await query<{ state: string; attended_recitation_call: boolean }>(
      'SELECT state, attended_recitation_call FROM weekly_reports WHERE membership_id = $1 ORDER BY week_end DESC LIMIT 1',
      [s.membershipId],
    );
    expect(rows[0].attended_recitation_call).toBe(true);
    expect(rows[0].state).not.toBe('Open');

    await relaunch();
    await byId('student-home').waitForDisplayed({ timeout: 30_000 });
    await expect(byId('report-status-card')).not.toHaveText(expect.stringContaining('أكّد حضورك'));
  });

  it('@P1 WR-03 on other days there is no weekly report to confirm', async () => {
    const s = await student(await group({ recitationDay: notToday() }));
    await loginAs(s.session.email, s.session.password, 'Student');

    await expect(byId('weekly-report-button')).not.toBeExisting();
    await expect(byId('week-card')).toBeDisplayed();
  });

  it('@P1 WR-04 an unconfirmed week is finalized at midnight with "attended = No"', async () => {
    const s = await studentOnRecitationDay();
    const live = await api.currentWeeklyReport(s.session.token);

    // It is now just past midnight after the recitation day.
    const tomorrow = addDays(localDate(), 1);
    await runJob('weekly-report-finalization', new Date(`${tomorrow}T00:20:00+01:00`));

    const rows = await query<{ state: string; attended_recitation_call: boolean }>(
      'SELECT state, attended_recitation_call FROM weekly_reports WHERE id = $1',
      [live.id],
    );
    expect(rows[0].attended_recitation_call).toBe(false);
    expect(rows[0].state).not.toBe('Open');

    const err = await api
      .confirmWeeklyReport(s.session.token, live.id as string, true)
      .catch((e: unknown) => e as api.ApiError);
    expect(err).toBeInstanceOf(api.ApiError);
  });
});
