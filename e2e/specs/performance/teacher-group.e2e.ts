import { group, student } from '../../src/fixtures/builders.js';
import { auditEntries, insertDailyReport, notificationLog, query } from '../../src/fixtures/db.js';
import { runJob } from '../../src/fixtures/jobs.js';
import { launchLoggedOut, loginAs, scrollAndTap, scrollTo, tap, waitVisible } from '../../src/support/app.js';
import { allByIdPrefix, byId } from '../../src/support/locators.js';
import { addDays, localDate } from '../../src/support/time.js';

/**
 * A group with two students who joined a week ago: one reported every day,
 * one never did (≥ 3 consecutive expected days without a report → at risk).
 */
async function groupWithAtRiskStudent() {
  const today = localDate();
  const g = await group();
  const engaged = await student(g, { startedAt: addDays(today, -8), overrides: { fullName: 'طالبة ملتزمة' } });
  const atRisk = await student(g, { startedAt: addDays(today, -8), overrides: { fullName: 'طالبة متعثرة' } });
  for (let d = -7; d <= -1; d += 1) {
    const date = addDays(today, d);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    if (weekday === g.recitation_day) continue; // no daily report on the recitation day
    await insertDailyReport(engaged.membershipId, { date, type: 'Normal' });
  }
  return { g, engaged, atRisk };
}

async function studentRowOrder(): Promise<string[]> {
  const rows = await allByIdPrefix('group-performance-student-');
  const ids: string[] = [];
  for (const row of rows) {
    const id = (await row.getAttribute(driver.isIOS ? 'name' : 'resource-id')) ?? '';
    if (/^group-performance-student-[0-9a-f-]{36}$/.test(id)) ids.push(id.slice('group-performance-student-'.length));
  }
  return ids;
}

/** SCR-22/23/24/25 · UC-07, UC-08, UC-14 · J6, J7 · docs/UF.md §17, SAS §18.4 */
describe('Teacher — group performance', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 PRF-05 the group view lists the weakest student first and flags who is at risk', async () => {
    const { g, engaged, atRisk } = await groupWithAtRiskStudent();

    await loginAs(g.teacher.email, g.teacher.password, 'Teacher');
    await waitVisible(`teacher-group-row-${g.id}`, 30_000);
    await expect(byId(`teacher-group-row-${g.id}-at-risk-value`)).toHaveText('1');

    await tap(`teacher-group-row-${g.id}`);
    await scrollTo(`group-performance-student-${engaged.membershipId}`);
    const order = await studentRowOrder();
    expect(order.indexOf(atRisk.membershipId)).toBeLessThan(order.indexOf(engaged.membershipId));
    await expect(byId(`group-performance-student-${atRisk.membershipId}`)).toHaveAttribute(
      'label',
      expect.stringContaining('خطر'),
    );
    await expect(byId(`group-performance-student-${engaged.membershipId}`)).not.toHaveAttribute(
      'label',
      expect.stringContaining('خطر'),
    );

    // The daily at-risk evaluation notifies the teacher (N-07).
    await runJob('at-risk-evaluation');
    const log = await notificationLog(g.teacher.id, 'N-07');
    expect(log.map((l) => l.subject_id)).toContain(atRisk.membershipId);
  });

  it('@P1 PRF-06 PRF-07 the teacher drills into one student and their raw reports, read-only', async () => {
    const { g, engaged } = await groupWithAtRiskStudent();

    await loginAs(g.teacher.email, g.teacher.password, 'Teacher');
    await tap(`teacher-group-row-${g.id}`);
    await scrollAndTap(`group-performance-student-${engaged.membershipId}`);
    await scrollAndTap('raw-reports-button');
    await expect(byId('raw-daily-reports-screen')).toBeExisting({ wait: 15_000 });
    await expect(byId('submit-report-button')).not.toBeExisting();
  });

  it('@P1 PRF-08 closing enrollment needs no confirmation and is audited', async () => {
    const g = await group();

    await loginAs(g.teacher.email, g.teacher.password, 'Teacher');
    await tap(`teacher-group-row-${g.id}`);
    await expect(byId('enrollment-toggle-button')).toHaveAttribute('value', '1');
    await tap('enrollment-toggle-button');
    await expect(byId('enrollment-toggle-button')).toHaveAttribute('value', '0', { wait: 15_000 });

    const rows = await query<{ enrollment_status: string }>('SELECT enrollment_status FROM groups WHERE id = $1', [g.id]);
    expect(rows[0].enrollment_status).toBe('Closed');
    expect((await auditEntries('ENROLLMENT_TOGGLED', g.id)).length).toBeGreaterThanOrEqual(2);
  });

  it('@P1 NAV-03 a teacher only sees the groups assigned to them', async () => {
    const mine = await group();
    const theirs = await group();

    await loginAs(mine.teacher.email, mine.teacher.password, 'Teacher');
    await waitVisible(`teacher-group-row-${mine.id}`, 30_000);
    await expect(byId(`teacher-group-row-${theirs.id}`)).not.toBeExisting();
  });
});
