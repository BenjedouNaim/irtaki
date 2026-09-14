import * as api from '../../src/fixtures/api.js';
import { ApiError } from '../../src/fixtures/api.js';
import { group, student } from '../../src/fixtures/builders.js';
import { query, setUserTimezone } from '../../src/fixtures/db.js';
import { answer, isSelected, pickRange, pickTime, startReport, submitReport } from '../../src/flows/daily.js';
import { launchLoggedOut, loginAs, relaunch, scrollAndTap, tap, waitVisible } from '../../src/support/app.js';
import { itKnownBug } from '../../src/support/known-issues.js';
import { byId, byTextContains } from '../../src/support/locators.js';
import { isoWeekday, localDate } from '../../src/support/time.js';

interface ReportRow {
  type: string;
  absence_reason: string | null;
  no_memorization_today: boolean | null;
  memo_from_ordinal: number | null;
  memo_to_ordinal: number | null;
  memo_time_from: string | null;
  memo_time_to: string | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_from_ordinal: number | null;
  rev_to_ordinal: number | null;
  rev_time_from: string | null;
  rev_time_to: string | null;
  read_tafsir: boolean | null;
}

async function todaysReport(membershipId: string): Promise<ReportRow | undefined> {
  const rows = await query<ReportRow>(
    `SELECT type, absence_reason, no_memorization_today, memo_from_ordinal, memo_to_ordinal,
            memo_time_from::text, memo_time_to::text, completed_50_repetitions,
            repetitions_in_single_session, no_revision_today, rev_from_ordinal, rev_to_ordinal,
            rev_time_from::text, rev_time_to::text, read_tafsir
       FROM daily_reports WHERE membership_id = $1 AND report_date = $2`,
    [membershipId, localDate()],
  );
  return rows[0];
}

/**
 * The form closes back to Student Home. The Home card is checked after a
 * relaunch: without one it stays stale (see DR-01b, a known bug).
 */
async function expectSubmittedHome(): Promise<void> {
  await waitVisible('student-home', 30_000);
  await byId('daily-report-form-top-bar-title').waitForExist({ reverse: true, timeout: 30_000 });
  await relaunch();
  await waitVisible('view-report-button', 30_000);
  await expect(byId('report-status-card-title')).toHaveText('تم إرسال تقرير اليوم');
  await expect(byId('submit-report-button')).not.toBeExisting();
}

/** SCR-08/09/10/11 · UC-05 · J2 · docs/UF.md §15 · SRS §9.5 */
describe('Daily report', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 DR-01 DR-02 a Normal report with memorization is stored exactly as entered', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await expect(byId('report-status-card-title')).toHaveText('اليوم يوم حفظ');

    await startReport('normal');
    await answer('memo-gate', true);
    // Al-Fatiha 1 → 5 (ordinals 1..5), 18:00 → 19:00.
    await pickRange('memo-range-field', { surah: 1, ayah: 1 }, { surah: 1, ayah: 5 });
    await expect(byId('memo-range-field-trigger-value')).toHaveText(expect.stringContaining('5'));
    await pickTime('memo-time-field', 'from', 18, 0);
    await pickTime('memo-time-field', 'to', 19, 0);

    // The single-session question only appears once 50 repetitions is "Yes".
    await expect(byId('single-session-toggle')).not.toBeExisting();
    await answer('completed-50-toggle', true);
    await answer('single-session-toggle', true);
    expect(await isSelected('single-session-toggle-yes')).toBe(true);

    await answer('rev-gate', false);
    await answer('read-tafsir-toggle', true);
    await submitReport();
    await expectSubmittedHome();

    expect(await todaysReport(s.membershipId)).toEqual({
      type: 'Normal',
      absence_reason: null,
      no_memorization_today: false,
      memo_from_ordinal: 1,
      memo_to_ordinal: 5,
      memo_time_from: '18:00:00',
      memo_time_to: '19:00:00',
      completed_50_repetitions: true,
      repetitions_in_single_session: true,
      no_revision_today: true,
      rev_from_ordinal: null,
      rev_to_ordinal: null,
      rev_time_from: null,
      rev_time_to: null,
      read_tafsir: true,
    });
  });

  itKnownBug(
    '@P1 DR-01b Student Home switches to "report submitted" right after submitting',
    '#163 — Home card reads GET /me/dashboard, which useSubmitDailyReport does not invalidate',
    async () => {
      const s = await student(await group());
      await loginAs(s.session.email, s.session.password, 'Student');
      await startReport('absent');
      await scrollAndTap('absence-reason-picker-sick');
      await submitReport();
      await expect(byId('view-report-button')).toBeDisplayed({ wait: 10_000 });
      await expect(byId('submit-report-button')).not.toBeExisting();
    },
  );

  it('@P1 DR-03 a Normal report with both gates answered "No" is accepted', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');

    await startReport('normal');
    await answer('memo-gate', false);
    await answer('rev-gate', false);
    await answer('read-tafsir-toggle', false);
    await submitReport();
    await expectSubmittedHome();

    const row = await todaysReport(s.membershipId);
    expect(row?.no_memorization_today).toBe(true);
    expect(row?.no_revision_today).toBe(true);
  });

  it('@P0 DR-06 an Absent report records the reason', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');

    await startReport('absent');
    await scrollAndTap('absence-reason-picker-other');
    await submitReport();
    await expectSubmittedHome();

    const row = await todaysReport(s.membershipId);
    expect(row?.type).toBe('Absent');
    expect(row?.absence_reason).toBe('Other');
  });

  it('@P0 DR-07 a Revision-only report needs a range and a time', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');

    await startReport('revision');
    await expect(byId('memo-gate')).not.toBeExisting();
    await expect(byId('completed-50-toggle')).not.toBeExisting();
    await expect(byId('submit-report-button')).not.toBeEnabled();

    await pickRange('rev-range-field', { surah: 1, ayah: 1 }, { surah: 1, ayah: 7 });
    await pickTime('rev-time-field', 'from', 18, 0);
    await pickTime('rev-time-field', 'to', 19, 0);
    await submitReport();
    await expectSubmittedHome();

    const row = await todaysReport(s.membershipId);
    expect(row?.type).toBe('Revision');
    expect([row?.rev_from_ordinal, row?.rev_to_ordinal]).toEqual([1, 7]);
  });

  it('@P0 DR-09 no daily report on the recitation day — the weekly report is offered instead', async () => {
    const s = await student(await group({ recitationDay: isoWeekday() }));
    await loginAs(s.session.email, s.session.password, 'Student');

    await expect(byId('report-status-card-title')).toHaveText('اليوم يوم التسميع');
    await expect(byId('weekly-report-button')).toBeDisplayed();
    await expect(byId('submit-report-button')).not.toBeExisting();

    const err = await api.submitDailyReport(s.session.token, { type: 'Absent', absence_reason: 'Sick' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('RECITATION_DAY');
  });

  it('@P1 DR-08 a report already submitted elsewhere is treated as success', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await startReport('absent');
    await scrollAndTap('absence-reason-picker-sick');

    await api.submitDailyReport(s.session.token, { type: 'Absent', absence_reason: 'Studying' });
    await submitReport();
    await expectSubmittedHome();
    expect((await todaysReport(s.membershipId))?.absence_reason).toBe('Studying');
  });

  it('@P1 DR-10 submitting after the day ended shows "today has ended" and returns Home', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');
    await startReport('absent');
    await scrollAndTap('absence-reason-picker-sick');

    // Move the student to a timezone whose calendar date is not the form's date,
    // so the server's "today" (VR-10) no longer matches report_date.
    const today = localDate();
    const zone = ['Pacific/Kiritimati', 'Pacific/Pago_Pago'].find(
      (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()) !== today,
    );
    expect(zone).toBeDefined();
    await setUserTimezone(s.session.id, zone as string);

    await submitReport();
    await expect(byTextContains('انتهى اليوم')).toBeDisplayed({ wait: 15_000 });
    await tap('daily-report-form-home-button');
    await expect(byId('student-home')).toBeDisplayed();
    expect(await todaysReport(s.membershipId)).toBeUndefined();
  });

  it('@P1 DR-11 leaving an untouched form needs no confirmation, a touched one does', async () => {
    const s = await student(await group());
    await loginAs(s.session.email, s.session.password, 'Student');

    await startReport('normal');
    await tap('daily-report-form-top-bar-back');
    await expect(byId('discard-report-dialog')).not.toBeExisting();

    await tap('report-type-card-normal');
    await answer('memo-gate', false);
    await tap('daily-report-form-top-bar-back');
    await expect(byId('discard-report-dialog-confirm-button')).toBeDisplayed();
  });

  it('@P1 DR-12 the submitted report opens read-only', async () => {
    const s = await student(await group());
    await api.submitDailyReport(s.session.token, { type: 'Absent', absence_reason: 'Sick' });
    await loginAs(s.session.email, s.session.password, 'Student');

    await tap('view-report-button');
    await expect(byId('report-detail-screen')).toBeExisting({ wait: 15_000 });
    await expect(byId('submit-report-button')).not.toBeExisting();
    await expect(byId('absence-reason-picker-sick')).not.toBeExisting();
  });
});
