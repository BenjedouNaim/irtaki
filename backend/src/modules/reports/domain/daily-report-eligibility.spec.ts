import {
  DailyReportEligibilityInput,
  evaluateDailyReportEligibility,
} from './daily-report-eligibility';

describe('evaluateDailyReportEligibility (E-05 invariants, UC-05 preconditions)', () => {
  const eligible: DailyReportEligibilityInput = {
    membershipActive: true,
    groupLifecycleState: 'Active',
    recitationDay: 5,
    todayIsoDay: 3,
    hasReportForToday: false,
  };

  it('allows submission when every precondition holds', () => {
    expect(evaluateDailyReportEligibility(eligible)).toEqual({
      canSubmit: true,
    });
  });

  it('blocks with membership_inactive when there is no Active membership (VR-35)', () => {
    expect(
      evaluateDailyReportEligibility({ ...eligible, membershipActive: false }),
    ).toEqual({ canSubmit: false, blockReason: 'membership_inactive' });
  });

  it('blocks with group_archived when the group is Archived (FR-DR-11, INV-21)', () => {
    expect(
      evaluateDailyReportEligibility({
        ...eligible,
        groupLifecycleState: 'Archived',
      }),
    ).toEqual({ canSubmit: false, blockReason: 'group_archived' });
  });

  it('blocks with recitation_day when today is the recitation day (VR-12, BR-16)', () => {
    expect(
      evaluateDailyReportEligibility({ ...eligible, todayIsoDay: 5 }),
    ).toEqual({ canSubmit: false, blockReason: 'recitation_day' });
  });

  it('blocks with already_submitted when a report exists for today (VR-11, INV-11)', () => {
    expect(
      evaluateDailyReportEligibility({
        ...eligible,
        hasReportForToday: true,
      }),
    ).toEqual({ canSubmit: false, blockReason: 'already_submitted' });
  });

  it('reports the first failing precondition in UC-05 order', () => {
    expect(
      evaluateDailyReportEligibility({
        membershipActive: false,
        groupLifecycleState: 'Archived',
        recitationDay: 5,
        todayIsoDay: 5,
        hasReportForToday: true,
      }).blockReason,
    ).toBe('membership_inactive');
    expect(
      evaluateDailyReportEligibility({
        ...eligible,
        groupLifecycleState: 'Archived',
        todayIsoDay: 5,
        hasReportForToday: true,
      }).blockReason,
    ).toBe('group_archived');
    expect(
      evaluateDailyReportEligibility({
        ...eligible,
        todayIsoDay: 5,
        hasReportForToday: true,
      }).blockReason,
    ).toBe('recitation_day');
  });
});
