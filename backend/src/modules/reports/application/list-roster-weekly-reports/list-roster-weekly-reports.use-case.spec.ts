/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  IWeeklyReportRepository,
  WeeklyReportRecord,
} from '../../domain/weekly-report.repository.interface';
import { IMembershipReportScope } from '../../domain/membership-report-scope.interface';
import { ListRosterWeeklyReportsUseCase } from './list-roster-weekly-reports.use-case';

describe('ListRosterWeeklyReportsUseCase (F-WR-04 / API-036)', () => {
  let useCase: ListRosterWeeklyReportsUseCase;
  let repository: jest.Mocked<IWeeklyReportRepository>;
  let scope: jest.Mocked<IMembershipReportScope>;

  const membershipId = '01916362-e61e-7f61-8270-b74e892c90aa';

  function record(
    id: string,
    weekStart: string,
    weekEnd: string,
    overrides: Partial<WeeklyReportRecord> = {},
  ): WeeklyReportRecord {
    return {
      id,
      membershipId,
      weekStart,
      weekEnd,
      expectedDays: 6,
      missedDailyReports: 1,
      missedDailyMemorization: 2,
      missedDailyRevision: 3,
      missed50Repetitions: 4,
      missedSingleSession: 5,
      attendedRecitationCall: true,
      state: 'Finalised',
      finalisedAt: `${weekEnd}T09:00:00.000Z`,
      finalisedBy: 'student-1',
      ...overrides,
    };
  }

  const newer = record(
    '01916362-e61e-7f61-8270-b74e892c90c2',
    '2026-08-22',
    '2026-08-28',
  );
  const older = record(
    '01916362-e61e-7f61-8270-b74e892c90c1',
    '2026-08-15',
    '2026-08-21',
    { attendedRecitationCall: false, finalisedBy: null },
  );

  beforeEach(() => {
    repository = {
      findCurrentWeekContextByUserId: jest.fn(),
      findByMembershipAndWeekStart: jest.fn(),
      createIfAbsent: jest.fn(),
      findOwnById: jest.fn(),
      finaliseByStudent: jest.fn(),
      findAllOpenWithTimezone: jest.fn(),
      countAttendedFinalisedWeeks: jest.fn(),
      finaliseAsScheduler: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
    };
    scope = {
      isActiveMembershipOfTeacher: jest.fn(),
      // The membership passed the guard in every case below unless a test
      // says otherwise.
      membershipExists: jest.fn().mockResolvedValue(true),
    };
    useCase = new ListRosterWeeklyReportsUseCase(repository, scope);
  });

  it('queries by the guard-verified membership id only, with the default limit of 20 and no filters (TS §15.2 step 4, APIS §9.2)', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [newer, older],
      hasMore: false,
    });

    const result = await useCase.execute(membershipId, {});

    expect(repository.findHistoryByMembershipId).toHaveBeenCalledWith({
      membershipId,
      from: null,
      to: null,
      limit: 20,
      cursor: null,
    });
    expect(repository.findOwnHistoryByUserId).not.toHaveBeenCalled();
    // A non-empty page already proves the membership exists (DB-FK-06).
    expect(scope.membershipExists).not.toHaveBeenCalled();
    expect(scope.isActiveMembershipOfTeacher).not.toHaveBeenCalled();
    expect(result.pagination).toEqual({ next_cursor: null, has_more: false });
    expect(result.data.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it('returns the same WeeklyReportDto shape as API-035 (APIS §10.8 "same pattern")', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [older],
      hasMore: false,
    });

    const result = await useCase.execute(membershipId, {});

    expect(result.data[0]).toEqual({
      id: older.id,
      week_start: '2026-08-15',
      week_end: '2026-08-21',
      expected_days: 6,
      missed_daily_reports: 1,
      missed_daily_memorization: 2,
      missed_daily_revision: 3,
      missed_50_repetitions: 4,
      missed_single_session: 5,
      attended_recitation_call: false,
      state: 'Finalised',
      finalised_at: '2026-08-21T09:00:00.000Z',
      finalised_by: 'Scheduler',
    });
    expect(result.data[0]).not.toHaveProperty('membership_id');
  });

  it('passes from/to through and clamps limit into [1, 100]', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await useCase.execute(membershipId, {
      from: '2026-08-01',
      to: '2026-08-31',
      limit: '500',
    });
    expect(repository.findHistoryByMembershipId).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: '2026-08-01',
        to: '2026-08-31',
        limit: 100,
      }),
    );

    await useCase.execute(membershipId, { limit: '0' });
    expect(repository.findHistoryByMembershipId).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 }),
    );
  });

  it('emits next_cursor = base64 {id, sortKey.weekStart} of the last row only when has_more (ISS-18)', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [newer, older],
      hasMore: true,
    });

    const result = await useCase.execute(membershipId, { limit: 2 });

    expect(result.pagination.has_more).toBe(true);
    expect(decodeCursor(result.pagination.next_cursor)).toEqual({
      id: older.id,
      sortKey: { weekStart: '2026-08-15' },
    });
  });

  it('decodes a valid cursor and falls back to the first page on a malformed one', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });
    const cursor = encodeCursor({
      id: older.id,
      sortKey: { weekStart: '2026-08-15' },
    });

    await useCase.execute(membershipId, { cursor });
    expect(repository.findHistoryByMembershipId).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: { id: older.id, sortKey: { weekStart: '2026-08-15' } },
      }),
    );

    await useCase.execute(membershipId, {
      cursor: encodeCursor({
        id: "' OR 1=1 --",
        sortKey: { weekStart: '2026-08-15' },
      }),
    });
    expect(repository.findHistoryByMembershipId).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: null }),
    );
  });

  it('returns an empty page (not an error) when the membership exists but has no finalised weeks', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await expect(useCase.execute(membershipId, {})).resolves.toEqual({
      data: [],
      pagination: { next_cursor: null, has_more: false },
    });
    expect(scope.membershipExists).toHaveBeenCalledTimes(1);
    expect(scope.membershipExists).toHaveBeenCalledWith(membershipId);
  });

  it('throws 404 NOT_FOUND (Arabic, no internals) when the membership does not exist at all — the Admin path past the DEC-C07 bypass (APIS §9.6, APIQ-NEW-09)', async () => {
    repository.findHistoryByMembershipId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });
    scope.membershipExists.mockResolvedValue(false);

    const failure = useCase.execute(membershipId, {});

    await expect(failure).rejects.toThrow(NotFoundException);
    await expect(failure).rejects.toMatchObject({
      response: {
        statusCode: 404,
        error: 'NOT_FOUND',
        message: expect.stringMatching(/[؀-ۿ]/) as unknown,
      },
    });
    // Still scoped to exactly the guard-verified id (TS §15.2 step 4).
    expect(repository.findHistoryByMembershipId).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId }),
    );
  });
});
