import {
  evaluateMembershipSuppression,
  type MembershipSuppressionContext,
} from './notification-suppression';

/** A Monday (2026-09-07) for a group whose recitation day is Friday (5). */
function context(
  overrides: Partial<MembershipSuppressionContext> = {},
): MembershipSuppressionContext {
  return {
    membershipState: 'Active',
    groupLifecycleState: 'Active',
    recitationDay: 5,
    localToday: '2026-09-07',
    reportExistsToday: false,
    ...overrides,
  };
}

describe('§22.3 membership suppression (FR-NOTIF-03)', () => {
  it('does not suppress when none of the conditions holds', () => {
    expect(evaluateMembershipSuppression(context())).toBeNull();
  });

  it('suppresses when a Daily Report already exists for the local today', () => {
    expect(
      evaluateMembershipSuppression(context({ reportExistsToday: true })),
    ).toBe('REPORT_ALREADY_EXISTS');
  });

  it("suppresses when today is the group's recitation day", () => {
    // 2026-09-11 is a Friday — ISO day 5, the group's recitation day.
    expect(
      evaluateMembershipSuppression(context({ localToday: '2026-09-11' })),
    ).toBe('RECITATION_DAY');
  });

  it('suppresses when the group is Archived', () => {
    expect(
      evaluateMembershipSuppression(
        context({ groupLifecycleState: 'Archived' }),
      ),
    ).toBe('GROUP_ARCHIVED');
  });

  it('suppresses when the membership is not Active', () => {
    expect(
      evaluateMembershipSuppression(context({ membershipState: 'Terminated' })),
    ).toBe('MEMBERSHIP_NOT_ACTIVE');
  });

  it('reports the FIRST condition in SAS §22.3 order when several hold', () => {
    expect(
      evaluateMembershipSuppression(
        context({
          reportExistsToday: true,
          groupLifecycleState: 'Archived',
          membershipState: 'Terminated',
        }),
      ),
    ).toBe('REPORT_ALREADY_EXISTS');
  });

  it('evaluates the recitation day against the LOCAL date, not the server', () => {
    // Same instant, two students: 2026-09-11T22:00Z is still Friday in
    // Tunis (UTC+1) but already Saturday in Auckland (UTC+12). Both dates
    // are supplied by the caller from users.timezone (T-01).
    expect(
      evaluateMembershipSuppression(context({ localToday: '2026-09-11' })),
    ).toBe('RECITATION_DAY');
    expect(
      evaluateMembershipSuppression(context({ localToday: '2026-09-12' })),
    ).toBeNull();
  });
});
