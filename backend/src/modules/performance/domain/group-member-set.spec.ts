import {
  activeWindowIntersects,
  GroupMemberWindow,
  selectGroupMemberSet,
} from './group-member-set';

/**
 * The group's recitation day is Friday (5), so the reporting week
 * containing Wed 2026-09-02 is Sat 2026-08-29 … Fri 2026-09-04 (BR-15).
 */
const CURRENT_WEEK = { from: '2026-08-29', to: '2026-09-04' };
/** A historical period: the month ending today (APIS §9.3 `month`). */
const LAST_MONTH = { from: '2026-08-02', to: '2026-09-02' };

function member(
  membershipId: string,
  overrides: Partial<GroupMemberWindow> = {},
): GroupMemberWindow {
  return {
    membershipId,
    state: 'Active',
    startedAt: '2026-01-01',
    endedAt: null,
    ...overrides,
  };
}

const active = member('active');
/** Removed INSIDE the current week — the case the two rules disagree on. */
const terminatedThisWeek = member('terminated-this-week', {
  state: 'Terminated',
  endedAt: '2026-09-01',
});
/** Removed before the current week but inside last month. */
const terminatedLastMonth = member('terminated-last-month', {
  state: 'Terminated',
  endedAt: '2026-08-20',
});
/** Removed before every period under test. */
const terminatedLongAgo = member('terminated-long-ago', {
  state: 'Terminated',
  endedAt: '2026-03-01',
});
/** Joined after every period under test. */
const joinedLater = member('joined-later', { startedAt: '2026-12-01' });

describe('activeWindowIntersects (FR-PERF-09 predicate)', () => {
  it('includes an Active membership with no end bound', () => {
    expect(activeWindowIntersects(active, LAST_MONTH)).toBe(true);
  });

  it('includes a Terminated membership whose window overlaps the period', () => {
    expect(activeWindowIntersects(terminatedLastMonth, LAST_MONTH)).toBe(true);
  });

  it('excludes a membership that ended before the period began', () => {
    expect(activeWindowIntersects(terminatedLongAgo, LAST_MONTH)).toBe(false);
  });

  it('excludes a membership that began after the period ended', () => {
    expect(activeWindowIntersects(joinedLater, LAST_MONTH)).toBe(false);
  });

  it('treats both bounds as INCLUSIVE — a single shared day intersects', () => {
    expect(
      activeWindowIntersects(
        member('ended-on-the-first-day', {
          state: 'Terminated',
          endedAt: LAST_MONTH.from,
        }),
        LAST_MONTH,
      ),
    ).toBe(true);
    expect(
      activeWindowIntersects(
        member('started-on-the-last-day', { startedAt: LAST_MONTH.to }),
        LAST_MONTH,
      ),
    ).toBe(true);
  });
});

/**
 * The rule this feature exists to get right, both branches, on the SAME
 * fixture — a group holding one Active member and three Terminated ones
 * (APIS §10.9; FR-PERF-09 vs FR-PERF-10, DEC-C04).
 */
describe('selectGroupMemberSet (FR-PERF-09 vs FR-PERF-10)', () => {
  const members = [
    active,
    terminatedThisWeek,
    terminatedLastMonth,
    terminatedLongAgo,
  ];

  describe('the current-week branch (FR-PERF-10)', () => {
    const selected = selectGroupMemberSet({
      members,
      period: CURRENT_WEEK,
      isCurrentWeek: true,
    });

    it('excludes terminated memberships ENTIRELY', () => {
      expect(selected.map((m) => m.membershipId)).toEqual(['active']);
    });

    it('excludes one terminated INSIDE the week — the exception, not a window test', () => {
      // Its active window [2026-01-01, 2026-09-01] plainly intersects
      // 2026-08-29 … 2026-09-04, so FR-PERF-09's predicate would keep it.
      // FR-PERF-10 excludes it by STATE regardless (UC-07 step 6).
      expect(activeWindowIntersects(terminatedThisWeek, CURRENT_WEEK)).toBe(
        true,
      );
      expect(selected).not.toContain(terminatedThisWeek);
    });
  });

  describe('every other period (FR-PERF-09)', () => {
    const selected = selectGroupMemberSet({
      members,
      period: LAST_MONTH,
      isCurrentWeek: false,
    });

    it('includes terminated memberships whose active window intersects', () => {
      expect(selected.map((m) => m.membershipId)).toEqual([
        'active',
        'terminated-this-week',
        'terminated-last-month',
      ]);
    });

    it('still excludes one whose window ended before the period', () => {
      expect(selected).not.toContain(terminatedLongAgo);
    });
  });

  it('returns the SAME member differently for the two branches', () => {
    const inWeek = selectGroupMemberSet({
      members: [terminatedThisWeek],
      period: CURRENT_WEEK,
      isCurrentWeek: true,
    });
    const inMonth = selectGroupMemberSet({
      members: [terminatedThisWeek],
      period: LAST_MONTH,
      isCurrentWeek: false,
    });

    expect(inWeek).toEqual([]);
    expect(inMonth).toEqual([terminatedThisWeek]);
  });

  it('keeps an Active member in the historical branch too', () => {
    expect(
      selectGroupMemberSet({
        members: [active],
        period: LAST_MONTH,
        isCurrentWeek: false,
      }),
    ).toEqual([active]);
  });

  it('never mutates the input list', () => {
    const input = [...members];
    selectGroupMemberSet({
      members: input,
      period: CURRENT_WEEK,
      isCurrentWeek: true,
    });
    expect(input).toEqual(members);
  });
});
