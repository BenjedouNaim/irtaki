/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import type { DatedDailyReportSnapshot } from '../../../reports/domain/weekly-metrics-calculator';
import type {
  GroupMemberRecord,
  IGroupPerformanceRepository,
} from '../../domain/group-performance.repository.interface';
import { GetGroupPerformanceUseCase } from './get-group-performance.use-case';

describe('GetGroupPerformanceUseCase (F-PERF-02 / API-038)', () => {
  let useCase: GetGroupPerformanceUseCase;
  let repository: jest.Mocked<IGroupPerformanceRepository>;

  const callerId = 'teacher-1';
  const groupId = 'group-1';
  /** Wednesday 2026-09-02 10:00 in Africa/Tunis (UTC+1). */
  const wednesday = new Date('2026-09-02T09:00:00.000Z');
  /**
   * Recitation day Friday (5) → the reporting week containing Wednesday is
   * Sat 2026-08-29 … Fri 2026-09-04, whose six expected days are
   * 2026-08-29 … 2026-09-03.
   */
  const context = {
    recitationDay: 5,
    archivedAt: null,
    callerTimezone: 'Africa/Tunis',
  };

  function member(
    membershipId: string,
    overrides: Partial<GroupMemberRecord> = {},
  ): GroupMemberRecord {
    return {
      membershipId,
      state: 'Active',
      startedAt: '2026-01-01',
      endedAt: null,
      fullName: `Student ${membershipId}`,
      timezone: 'Africa/Tunis',
      ...overrides,
    };
  }

  function snapshot(
    membershipId: string,
    reportDate: string,
    overrides: Partial<DatedDailyReportSnapshot> = {},
  ) {
    return {
      membershipId,
      reportDate,
      type: 'Normal' as const,
      absenceReason: null,
      noMemorizationToday: false,
      noRevisionToday: false,
      hasMemoRange: true,
      completed50Repetitions: true,
      repetitionsInSingleSession: true,
      ...overrides,
    };
  }

  beforeEach(() => {
    repository = {
      findContext: jest.fn(),
      findActiveMembers: jest.fn(),
      findMembersIntersecting: jest.fn(),
      findDaySnapshots: jest.fn(),
      findAttendedWeeks: jest.fn(),
      findLastReportDates: jest.fn(),
    };
    repository.findContext.mockResolvedValue(context);
    repository.findActiveMembers.mockResolvedValue([]);
    repository.findMembersIntersecting.mockResolvedValue([]);
    repository.findDaySnapshots.mockResolvedValue([]);
    repository.findAttendedWeeks.mockResolvedValue([]);
    repository.findLastReportDates.mockResolvedValue([]);
    useCase = new GetGroupPerformanceUseCase(repository);
  });

  function run(query: Record<string, string> = {}) {
    return useCase.execute(callerId, groupId, query, wednesday);
  }

  describe('the member-set rule (FR-PERF-09 vs FR-PERF-10)', () => {
    it('asks for ACTIVE members only when the period is the current week', async () => {
      await run({ period: 'week' });

      expect(repository.findActiveMembers).toHaveBeenCalledWith(groupId);
      expect(repository.findMembersIntersecting).not.toHaveBeenCalled();
    });

    it('takes the same branch when ?period= is omitted (UC-07 step 1 default)', async () => {
      await run();

      expect(repository.findActiveMembers).toHaveBeenCalledWith(groupId);
      expect(repository.findMembersIntersecting).not.toHaveBeenCalled();
    });

    it('asks for the period-intersecting set on every other period', async () => {
      await run({ period: 'month' });

      expect(repository.findMembersIntersecting).toHaveBeenCalledWith(
        groupId,
        '2026-08-02',
        '2026-09-02',
      );
      expect(repository.findActiveMembers).not.toHaveBeenCalled();
    });

    it('takes the current-week branch for a custom range that IS this week', async () => {
      // "except when `period` RESOLVES TO the current week" (APIS §10.9).
      await run({ period: 'custom', from: '2026-08-29', to: '2026-09-04' });

      expect(repository.findActiveMembers).toHaveBeenCalledWith(groupId);
      expect(repository.findMembersIntersecting).not.toHaveBeenCalled();
    });

    it('drops a terminated member the historical query returned for the week view', async () => {
      // Defence in depth: the domain predicate is applied to the rows too,
      // so the exclusion holds even if the query ever returned more.
      repository.findActiveMembers.mockResolvedValue([
        member('active'),
        member('terminated', {
          state: 'Terminated',
          endedAt: '2026-09-01',
        }),
      ]);

      const { data } = await run({ period: 'week' });

      expect(data.students.map((s) => s.membership_id)).toEqual(['active']);
    });

    it('keeps a terminated member whose window intersects a historical period', async () => {
      repository.findMembersIntersecting.mockResolvedValue([
        member('active'),
        member('terminated', {
          state: 'Terminated',
          endedAt: '2026-08-20',
        }),
      ]);

      const { data } = await run({ period: 'month' });

      expect(data.students.map((s) => s.membership_id).sort()).toEqual([
        'active',
        'terminated',
      ]);
    });

    it('counts a terminated member only up to ended_at (FR-PERF-09 proration)', async () => {
      // Joined Sat 2026-08-29 and removed Sun 2026-08-30, so of the last
      // week's six expected days only those two fall inside
      // EffectiveWindow(m) — "for the portion of the period during which
      // their Membership was active".
      repository.findMembersIntersecting.mockResolvedValue([
        member('terminated', {
          state: 'Terminated',
          startedAt: '2026-08-29',
          endedAt: '2026-08-30',
        }),
      ]);
      repository.findDaySnapshots.mockResolvedValue([
        snapshot('terminated', '2026-08-29'),
      ]);

      const { data } = await run({ period: 'month' });

      // 1 of 2 expected days reported — never 1 of 6, and never 1 of a month.
      expect(data.submission_rate).toBe(50);
    });
  });

  describe('the response (APIS §10.9)', () => {
    it('returns the whole payload inside the §9.1 envelope, weakest first', async () => {
      repository.findActiveMembers.mockResolvedValue([
        member('strong'),
        member('weak'),
      ]);
      repository.findDaySnapshots.mockResolvedValue([
        // `strong` reported on all five expected days reached so far
        // (08-29 … 09-02; 09-03 is beyond today and 09-04 is the
        // recitation day, neither of them expected yet).
        snapshot('strong', '2026-08-29'),
        snapshot('strong', '2026-08-30'),
        snapshot('strong', '2026-08-31'),
        snapshot('strong', '2026-09-01'),
        snapshot('strong', '2026-09-02'),
        // `weak` reported on one, and filed one excused and one unexcused
        // absence.
        snapshot('weak', '2026-08-29'),
        snapshot('weak', '2026-08-30', {
          type: 'Absent',
          absenceReason: 'Sick',
          hasMemoRange: false,
          noMemorizationToday: null,
          noRevisionToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
        snapshot('weak', '2026-08-31', {
          type: 'Absent',
          absenceReason: 'Other',
          hasMemoRange: false,
          noMemorizationToday: null,
          noRevisionToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
      ]);

      const { data } = await run({ period: 'week' });

      // `weak`: 4 effective days (the Sick day leaves every denominator,
      // BR-24), 2 of them unreported → submission 50, memorization 25,
      // revision 25; attendance undefined (the week is still running) →
      // mean(50, 25, 25).
      expect(data.students).toEqual([
        {
          membership_id: 'weak',
          full_name: 'Student weak',
          commitment_score: 100 / 3,
        },
        {
          membership_id: 'strong',
          full_name: 'Student strong',
          commitment_score: 100,
        },
      ]);
      expect(data.commitment_average).toBeCloseTo((100 / 3 + 100) / 2, 10);
      // Pooled: strong 5/5, weak 2/4 → 7/9.
      expect(data.submission_rate).toBeCloseTo((7 / 9) * 100, 10);
      expect(data.absence_breakdown).toEqual({
        sick: 1,
        studying: 0,
        other: 1,
      });
    });

    it('never fabricates a zero for a group with no data at all (DEC-B04)', async () => {
      repository.findActiveMembers.mockResolvedValue([
        // Joins tomorrow: no expected day of this week is inside its window.
        member('newcomer', { startedAt: '2026-09-30' }),
      ]);

      const { data } = await run({ period: 'week' });

      expect(data.commitment_average).toBeNull();
      expect(data.submission_rate).toBeNull();
      expect(data.students).toEqual([
        {
          membership_id: 'newcomer',
          full_name: 'Student newcomer',
          commitment_score: null,
        },
      ]);
    });

    it('returns an empty group without a zero-division artefact (alt. flow 3a)', async () => {
      const { data } = await run({ period: 'week' });

      expect(data).toEqual({
        commitment_average: null,
        students: [],
        absence_breakdown: { sick: 0, studying: 0, other: 0 },
        submission_rate: null,
      });
    });

    it('reads daily reports ONCE for the whole group, never per member (SA §20)', async () => {
      repository.findActiveMembers.mockResolvedValue([
        member('a'),
        member('b'),
        member('c'),
      ]);

      await run({ period: 'week' });

      expect(repository.findDaySnapshots).toHaveBeenCalledTimes(1);
      expect(repository.findDaySnapshots).toHaveBeenCalledWith(
        ['a', 'b', 'c'],
        '2026-08-29',
        '2026-09-04',
        'live',
      );
      // No week in the current-week view has passed its recitation day, so
      // `W(P)` is empty for every member and the attendance read is skipped
      // entirely rather than run with an empty window (DEC-A03, EC-44).
      expect(repository.findAttendedWeeks).not.toHaveBeenCalled();
    });

    it('credits attendance only for a member’s own elapsed weeks', async () => {
      // A window that reaches back before the running week, so one week has
      // passed its recitation day and one has not (DEC-A03, EC-44).
      repository.findMembersIntersecting.mockResolvedValue([member('a')]);
      repository.findAttendedWeeks.mockResolvedValue([
        { membershipId: 'a', weekStart: '2026-08-22' },
        // The running week: even a stored attended row cannot count yet.
        { membershipId: 'a', weekStart: '2026-08-29' },
      ]);

      const { data } = await run({
        period: 'custom',
        from: '2026-08-22',
        to: '2026-09-04',
      });

      // Attendance is one of four components; a bare 100 would mean both
      // weeks counted. Exactly one elapsed week, attended → 100 on that
      // component alone.
      expect(repository.findAttendedWeeks).toHaveBeenCalledWith(
        ['a'],
        '2026-08-22',
        '2026-08-22',
        'historical',
      );
      expect(data.students[0].commitment_score).toBe(25);
    });
  });

  describe('the soft-delete scope is PERIOD-AWARE (SAS §20.2, FR-PERF-09)', () => {
    it('hides soft-deleted rows on the current-week view (FR-PERF-10)', async () => {
      repository.findActiveMembers.mockResolvedValue([member('a')]);

      await run({ period: 'week' });

      expect(repository.findDaySnapshots).toHaveBeenCalledWith(
        ['a'],
        expect.any(String),
        expect.any(String),
        'live',
      );
    });

    it('reveals them on every other period — the removed student’s own reports', async () => {
      // SAS §20.2: "Teacher, historical group aggregates | Yes, but only for
      // the period the membership was active". The termination cascade
      // stamps `deleted_at` on a removed member's daily and weekly reports,
      // so a global filter would list the member and then show no data.
      repository.findMembersIntersecting.mockResolvedValue([
        member('gone', { state: 'Terminated', endedAt: '2026-08-25' }),
      ]);

      await run({ period: 'month' });

      expect(repository.findDaySnapshots).toHaveBeenCalledWith(
        ['gone'],
        expect.any(String),
        expect.any(String),
        'historical',
      );
    });

    it('uses the historical scope for the weekly read too', async () => {
      repository.findMembersIntersecting.mockResolvedValue([member('a')]);

      await run({ period: '3months' });

      expect(repository.findAttendedWeeks).toHaveBeenCalledWith(
        ['a'],
        expect.any(String),
        expect.any(String),
        'historical',
      );
    });

    it('scores a terminated member from its own soft-deleted reports', async () => {
      // The end-to-end consequence of the two branches above: with the rows
      // visible the member's score is real, not the null a global filter
      // would produce for a member FR-PERF-09 put in the list.
      repository.findMembersIntersecting.mockResolvedValue([
        member('gone', { state: 'Terminated', endedAt: '2026-09-01' }),
      ]);
      repository.findDaySnapshots.mockResolvedValue([
        snapshot('gone', '2026-08-29'),
        snapshot('gone', '2026-08-30'),
        snapshot('gone', '2026-08-31'),
        snapshot('gone', '2026-09-01'),
      ]);

      const { data } = await run({ period: 'month' });

      expect(data.students[0].membership_id).toBe('gone');
      expect(data.students[0].commitment_score).not.toBeNull();
      expect(data.submission_rate).not.toBeNull();
    });
  });

  describe('scope and existence', () => {
    it('answers 404 when the group id names no group (the Admin path, APIS §9.6)', async () => {
      repository.findContext.mockResolvedValue(null);

      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findActiveMembers).not.toHaveBeenCalled();
    });

    it('resolves the period from the CALLER’s timezone (T-01, SAS §19)', async () => {
      repository.findContext.mockResolvedValue({
        ...context,
        // 2026-09-02T09:00Z is already Thursday 2026-09-03 in Auckland, so
        // the current reporting week is the NEXT one.
        callerTimezone: 'Pacific/Auckland',
      });

      await run({ period: 'week' });

      // Still the current-week branch — resolved against the caller's own
      // today, not the server's.
      expect(repository.findActiveMembers).toHaveBeenCalledWith(groupId);
    });

    it('never writes anything — the whole response is a read-time derivation', async () => {
      repository.findActiveMembers.mockResolvedValue([member('a')]);

      await run({ period: 'week' });

      expect(Object.keys(repository)).toEqual([
        'findContext',
        'findActiveMembers',
        'findMembersIntersecting',
        'findDaySnapshots',
        'findAttendedWeeks',
        'findLastReportDates',
      ]);
    });
  });
});
