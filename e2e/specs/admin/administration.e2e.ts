import * as api from '../../src/fixtures/api.js';
import { SEEDED, group, staffMember, student, unique, user } from '../../src/fixtures/builders.js';
import { auditEntries, membershipState, query } from '../../src/fixtures/db.js';
import { confirmDialog, launchLoggedOut, loginAs, scrollAndTap, tap, typeInto, waitVisible } from '../../src/support/app.js';
import { env } from '../../src/support/env.js';
import { itKnownBug, itKnownGap } from '../../src/support/known-issues.js';
import { byId } from '../../src/support/locators.js';

async function loginAdmin(): Promise<void> {
  await loginAs(SEEDED.admin, env.seedPassword, 'Admin');
}

/** SCR-27 → SCR-29 for one group, found through the list's search box. */
async function openGroupDetail(groupId: string, name: string): Promise<void> {
  await tap('admin-groups-button');
  await typeInto('groups-list-search', name);
  await scrollAndTap(`group-row-${groupId}`);
  await waitVisible('group-detail-top-bar');
}

/** SCR-28: fill and submit. The staff pickers close as soon as a person is chosen. */
async function createGroupThroughUi(input: {
  name: string;
  recitationDay: number;
  teacherId: string;
  assistantId: string;
}): Promise<void> {
  await tap('admin-groups-button');
  await tap('create-group-header-button');
  // Return closes the keyboard; otherwise the next tap only dismisses it.
  await typeInto('group-name-input', `${input.name}\n`);
  await scrollAndTap('gender-Female');
  await scrollAndTap(`recitation-day-option-${input.recitationDay}`);
  await scrollAndTap('teacher-picker');
  await scrollAndTap(`teacher-option-${input.teacherId}`);
  await scrollAndTap('assistant-picker');
  await scrollAndTap(`assistant-option-${input.assistantId}`);
  await scrollAndTap('create-group-submit-button');
}

/** SCR-26..33 · UC-10..13, UC-16, UC-17 · docs/UF.md §19–21 */
describe('Administration', () => {
  beforeEach(async () => {
    await launchLoggedOut();
  });

  it('@P0 ADM-01 the Admin creates a group, which starts Closed and Active', async () => {
    const [teacher, assistant] = await Promise.all([staffMember('Teacher'), staffMember('Assistant')]);
    const name = unique('E2E مجموعة جديدة');

    await loginAdmin();
    await createGroupThroughUi({ name, recitationDay: 3, teacherId: teacher.id, assistantId: assistant.id });
    await byId('create-group-submit-button').waitForExist({ reverse: true, timeout: 30_000 });

    const rows = await query<{
      id: string;
      gender: string;
      recitation_day: number;
      enrollment_status: string;
      lifecycle_state: string;
      teacher_id: string;
      assistant_id: string;
    }>(
      'SELECT id, gender, recitation_day, enrollment_status, lifecycle_state, teacher_id, assistant_id FROM groups WHERE name = $1',
      [name],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      gender: 'Female',
      recitation_day: 3,
      enrollment_status: 'Closed',
      lifecycle_state: 'Active',
      teacher_id: teacher.id,
      assistant_id: assistant.id,
    });
    expect(await auditEntries('GROUP_CREATED', rows[0].id)).toHaveLength(1);
  });

  it('@P1 ADM-02 a duplicate group name is refused and nothing is created', async () => {
    const existing = await group();
    const [teacher, assistant] = await Promise.all([staffMember('Teacher'), staffMember('Assistant')]);

    await loginAdmin();
    await createGroupThroughUi({
      name: existing.name,
      recitationDay: 2,
      teacherId: teacher.id,
      assistantId: assistant.id,
    });

    await waitVisible('create-group-general-error', 15_000);
    await expect(byId('create-group-submit-button')).toBeExisting();
    expect(await query('SELECT id FROM groups WHERE name = $1', [existing.name])).toHaveLength(1);
  });

  it('@P0 ADM-05 archiving needs confirmation and stops the group\'s daily reporting', async () => {
    const g = await group();
    const s = await student(g);

    await loginAdmin();
    await openGroupDetail(g.id, g.name);
    await scrollAndTap('toggle-lifecycle-button');
    await confirmDialog('lifecycle-confirm-dialog');
    await expect(byId('group-detail-lifecycle-badge')).toHaveText(expect.stringContaining('مؤرشفة'), {
      wait: 15_000,
    });

    const rows = await query<{ lifecycle_state: string }>('SELECT lifecycle_state FROM groups WHERE id = $1', [g.id]);
    expect(rows[0].lifecycle_state).toBe('Archived');

    await launchLoggedOut();
    await loginAs(s.session.email, s.session.password, 'Student');
    await expect(byId('submit-report-button')).not.toBeExisting();
  });

  it('@P0 ADM-09 the Admin promotes a User to Teacher', async () => {
    const u = await user('promote');

    await loginAdmin();
    await tap('admin-users-button');
    await tap('users-filter-User');
    await scrollAndTap(`promote-user-${u.id}-button`);
    await tap(`promote-user-${u.id}-sheet-option-Teacher`);
    await tap(`promote-user-${u.id}-sheet-continue`);
    await confirmDialog(`promote-user-${u.id}-confirm`);
    await byId(`promote-user-${u.id}-button`).waitForExist({ reverse: true, timeout: 15_000 });

    const rows = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [u.id]);
    expect(rows[0].role).toBe('Teacher');

    await launchLoggedOut();
    await loginAs(u.email, u.password, 'Teacher');
    await waitVisible('teacher-groups-empty', 30_000);
  });

  itKnownGap(
    '@P0 ADM-08 the Admin removes a student from the roster after the strongest confirmation',
    'UC-12 has no UI on SCR-29/30 although DELETE /memberships/:id exists',
    async () => {
      const g = await group();
      const s = await student(g);
      await loginAdmin();
      await openGroupDetail(g.id, g.name);
      await scrollAndTap('group-detail-roster-button');
      await scrollAndTap(`roster-row-${s.membershipId}`);
      await waitVisible('remove-student-button');
    },
  );

  it('@P0 ADM-08b a removed student is a plain User again', async () => {
    const g = await group();
    const s = await student(g);
    const admin = await api.login(SEEDED.admin, env.seedPassword);
    await api.terminateMembership(admin.token, s.membershipId);
    expect(await membershipState(s.membershipId)).toBe('Terminated');

    await loginAs(s.session.email, s.session.password, 'User');
    await waitVisible('browse-groups-button', 30_000);
  });

  itKnownBug(
    '@P1 ADM-07 the Admin roster keeps the removed student, which opens Recovery',
    'SCR-30 expects removed rows, but GET /groups/{id}/memberships omits Terminated rows unless ?as_of= is sent, and the app never sends it',
    async () => {
      const g = await group();
      const s = await student(g);
      const admin = await api.login(SEEDED.admin, env.seedPassword);
      await api.terminateMembership(admin.token, s.membershipId);

      await loginAdmin();
      await openGroupDetail(g.id, g.name);
      await scrollAndTap('group-detail-roster-button');
      await waitVisible('roster-removed-label');
      await scrollAndTap(`roster-row-${s.membershipId}`);
      await waitVisible('recovery-screen');
    },
  );

  it('@P1 ADM-10 the audit log lists the group creation', async () => {
    const g = await group();

    await loginAdmin();
    await tap('admin-audit-button');
    await tap('audit-filter-GROUP_CREATED');
    await waitVisible('audit-log-top-bar');
    expect(await auditEntries('GROUP_CREATED', g.id)).toHaveLength(1);
  });

  it('@P1 ADM-04 reassigning the teacher moves the group to the new teacher\'s Home', async () => {
    const g = await group();
    const newTeacher = await staffMember('Teacher');

    await loginAdmin();
    await openGroupDetail(g.id, g.name);
    await scrollAndTap('staff-reassign-open-button');
    await tap('reassign-staff-role-teacher');
    await scrollAndTap(`reassign-teacher-option-${newTeacher.id}`);
    await tap('reassign-staff-save-button');
    await byId('reassign-staff-save-button').waitForExist({ reverse: true, timeout: 15_000 });

    const rows = await query<{ teacher_id: string }>('SELECT teacher_id FROM groups WHERE id = $1', [g.id]);
    expect(rows[0].teacher_id).toBe(newTeacher.id);

    await launchLoggedOut();
    await loginAs(newTeacher.email, newTeacher.password, 'Teacher');
    await waitVisible(`teacher-group-row-${g.id}`, 30_000);

    await launchLoggedOut();
    await loginAs(g.teacher.email, g.teacher.password, 'Teacher');
    await waitVisible('teacher-groups-empty', 30_000);
  });

  it('@P1 ADM-06 a group that never had members can be deleted', async () => {
    const g = await group({ open: false });

    await loginAdmin();
    await openGroupDetail(g.id, g.name);
    await scrollAndTap('delete-group-button');
    await confirmDialog('delete-group-confirm-dialog');
    await waitVisible('groups-list-top-bar', 15_000);

    expect(await query('SELECT id FROM groups WHERE id = $1', [g.id])).toHaveLength(0);
  });

  it('@P1 ADM-06b a group with membership history cannot be deleted', async () => {
    const g = await group();
    await student(g);
    const admin = await api.login(SEEDED.admin, env.seedPassword);
    const err = await api
      .deleteGroup(admin.token, g.id)
      .then(() => undefined, (e: unknown) => e as api.ApiError);
    expect(err?.code).toBe('GROUP_HAS_HISTORY');

    await loginAdmin();
    await openGroupDetail(g.id, g.name);
    await scrollAndTap('delete-group-button');
    await confirmDialog('delete-group-confirm-dialog');
    await waitVisible('delete-group-error-message', 15_000);
    await expect(byId('delete-group-error-message')).toHaveText('لا يمكن حذف مجموعة سبق أن انضم إليها طلاب');
    expect(await query('SELECT id FROM groups WHERE id = $1', [g.id])).toHaveLength(1);
  });
});
