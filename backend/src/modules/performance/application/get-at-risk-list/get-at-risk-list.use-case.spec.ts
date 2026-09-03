/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import type {
  GroupMemberRecord,
  IGroupPerformanceRepository,
} from '../../domain/group-performance.repository.interface';
import { GetAtRiskListUseCase } from './get-at-risk-list.use-case';

describe('GetAtRiskListUseCase (F-PERF-04 / API-040)', () => {
  let useCase: GetAtRiskListUseCase;
  let repository: jest.Mocked<IGroupPerformanceRepository>;

  const callerId = 'teacher-1';
  const groupId = 'group-1';
  /** Wednesday 2026-09-09 10:00 in Africa/Tunis (UTC+1). */
  const wednesday = new Date('2026-09-09T09:00:00.000Z');
  /** Recitation day Friday (5): every Friday is skipped, DEC-A03. */
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
      fullName: `طالب ${membershipId}`,
      timezone: 'Africa/Tunis',
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
    useCase = new GetAtRiskListUseCase(repository);
  });

  function run() {
    return useCase.execute(callerId, groupId, wednesday);
  }

  describe('the member set (FR-PERF-10, DEC-C04, AC-33)', () => {
    it('asks for ACTIVE members only — terminated ones are excluded entirely', async () => {
      await run();

      expect(repository.findActiveMembers).toHaveBeenCalledWith(groupId);
      // Never the period-aware historical branch: the at-risk list has no
      // period and no FR-PERF-09 exception (SAS §18.4, DEC-C04).
      expect(repository.findMembersIntersecting).not.toHaveBeenCalled();
    });

    it('reads the last report dates of the member set in ONE call (SA §20)', async () => {
      repository.findActiveMembers.mockResolvedValue([
        member('m-1'),
        member('m-2'),
      ]);

      await run();

      expect(repository.findLastReportDates).toHaveBeenCalledTimes(1);
      expect(repository.findLastReportDates).toHaveBeenCalledWith([
        'm-1',
        'm-2',
      ]);
    });
  });

  describe('the DEC-B05 predicate over the member set', () => {
    it('lists only the members DS-04 flags, with their day counts', async () => {
      repository.findActiveMembers.mockResolvedValue([
        member('silent'),
        member('recent'),
        member('never'),
      ]);
      repository.findLastReportDates.mockResolvedValue([
        // Sun 6 Sep → Mon 7, Tue 8, Wed 9 are three expected days.
        { membershipId: 'silent', lastReportDate: '2026-09-06' },
        // Mon 7 Sep → only Tue 8 and Wed 9.
        { membershipId: 'recent', lastReportDate: '2026-09-07' },
        // `never` is simply absent from the result — it never reported.
      ]);

      const response = await run();

      expect(response).toEqual({
        data: [
          {
            membership_id: 'silent',
            full_name: 'طالب silent',
            days_since_last_report: 3,
          },
          {
            membership_id: 'never',
            full_name: 'طالب never',
            days_since_last_report: expect.any(Number) as number,
          },
        ],
      });
    });

    it('keeps a null full_name null rather than coercing it (never "")', async () => {
      repository.findActiveMembers.mockResolvedValue([
        member('m-1', { fullName: null }),
      ]);

      const response = await run();

      // Enrolled 1 Jan, never reported: 252 calendar days through Wed 9 Sep
      // minus the 36 Fridays among them (DEC-A03, the recitation day is
      // never an expected day).
      expect(response.data).toEqual([
        { membership_id: 'm-1', full_name: null, days_since_last_report: 216 },
      ]);
    });

    it('measures each member’s window in THEIR OWN timezone (T-01, INV-27)', async () => {
      // 2026-09-09T09:00Z is still Tue 8 Sep in Honolulu and already Wed 9
      // in Tunis. The Pacific member's last report on Sat 5 Sep therefore
      // leaves Sun 6, Mon 7, Tue 8 — three expected days, at risk — while
      // the reading Teacher's own clock is never consulted.
      repository.findActiveMembers.mockResolvedValue([
        member('pacific', { timezone: 'Pacific/Honolulu' }),
      ]);
      repository.findLastReportDates.mockResolvedValue([
        { membershipId: 'pacific', lastReportDate: '2026-09-05' },
      ]);

      const response = await run();

      expect(response.data).toEqual([
        {
          membership_id: 'pacific',
          full_name: 'طالب pacific',
          days_since_last_report: 3,
        },
      ]);
    });

    it('truncates the window at an archived group’s date (FR-WR-10, BR-42)', async () => {
      // Archived on Sun 6 Sep: the window ends there, so only Sat 5 and
      // Sun 6 follow the Thu 3 Sep report — two expected days, not at risk.
      repository.findContext.mockResolvedValue({
        ...context,
        archivedAt: '2026-09-06T12:00:00.000Z',
      });
      repository.findActiveMembers.mockResolvedValue([member('m-1')]);
      repository.findLastReportDates.mockResolvedValue([
        { membershipId: 'm-1', lastReportDate: '2026-09-03' },
      ]);

      const response = await run();

      expect(response.data).toEqual([]);
    });

    it('never counts days before the membership started (FR-WR-09)', async () => {
      // Enrolled Tue 8 Sep, never reported: Tue 8 and Wed 9 only.
      repository.findActiveMembers.mockResolvedValue([
        member('fresh', { startedAt: '2026-09-08' }),
      ]);

      const response = await run();

      expect(response.data).toEqual([]);
    });
  });

  describe('the envelope and the not-found path', () => {
    it('returns the APIS §9.1 collection envelope with no pagination keys', async () => {
      const response = await run();

      expect(response).toEqual({ data: [] });
      expect(response).not.toHaveProperty('pagination');
    });

    it('404s when the group id names no group (the Admin path, APIS §9.6)', async () => {
      repository.findContext.mockResolvedValue(null);

      await expect(run()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.findActiveMembers).not.toHaveBeenCalled();
    });
  });
});
