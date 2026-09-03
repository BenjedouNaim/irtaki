/* eslint-disable @typescript-eslint/unbound-method */
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  IWeeklyReportRepository,
  WeeklyReportRecord,
} from '../../domain/weekly-report.repository.interface';
import { ListOwnWeeklyReportsUseCase } from './list-own-weekly-reports.use-case';

describe('ListOwnWeeklyReportsUseCase (F-WR-03 / API-035)', () => {
  let useCase: ListOwnWeeklyReportsUseCase;
  let repository: jest.Mocked<IWeeklyReportRepository>;

  const userId = 'student-1';

  function record(
    id: string,
    weekStart: string,
    weekEnd: string,
    overrides: Partial<WeeklyReportRecord> = {},
  ): WeeklyReportRecord {
    return {
      id,
      membershipId: 'membership-1',
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
      finalisedBy: userId,
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
      finaliseAsScheduler: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
    };
    useCase = new ListOwnWeeklyReportsUseCase(repository);
  });

  it('asks the repository for the first page with the default limit of 20 and no filters (APIS §9.2)', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [newer, older],
      hasMore: false,
    });

    const result = await useCase.execute(userId, {});

    expect(repository.findOwnHistoryByUserId).toHaveBeenCalledWith({
      userId,
      from: null,
      to: null,
      limit: 20,
      cursor: null,
    });
    expect(result.pagination).toEqual({ next_cursor: null, has_more: false });
    expect(result.data.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it('maps rows through the WeeklyReportDto mapper (APIS §10.8 names, finalised_by as the SAS E-06 enum)', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [newer, older],
      hasMore: false,
    });

    const result = await useCase.execute(userId, {});

    expect(result.data[0]).toEqual({
      id: newer.id,
      week_start: '2026-08-22',
      week_end: '2026-08-28',
      expected_days: 6,
      missed_daily_reports: 1,
      missed_daily_memorization: 2,
      missed_daily_revision: 3,
      missed_50_repetitions: 4,
      missed_single_session: 5,
      attended_recitation_call: true,
      state: 'Finalised',
      finalised_at: '2026-08-28T09:00:00.000Z',
      finalised_by: 'Student',
    });
    expect(result.data[1]).toMatchObject({
      attended_recitation_call: false,
      finalised_by: 'Scheduler',
    });
    expect(result.data[0]).not.toHaveProperty('membership_id');
    expect(result.data[0]).not.toHaveProperty('can_confirm');
  });

  it('passes from/to through and clamps limit into [1, 100]', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await useCase.execute(userId, {
      from: '2026-08-01',
      to: '2026-08-31',
      limit: '500',
    });
    expect(repository.findOwnHistoryByUserId).toHaveBeenLastCalledWith(
      expect.objectContaining({
        from: '2026-08-01',
        to: '2026-08-31',
        limit: 100,
      }),
    );

    await useCase.execute(userId, { limit: '0' });
    expect(repository.findOwnHistoryByUserId).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 1 }),
    );

    await useCase.execute(userId, { limit: 'abc' });
    expect(repository.findOwnHistoryByUserId).toHaveBeenLastCalledWith(
      expect.objectContaining({ limit: 20 }),
    );
  });

  it('emits next_cursor = base64 {id, sortKey.weekStart} of the last row only when has_more (ISS-18)', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [newer, older],
      hasMore: true,
    });

    const result = await useCase.execute(userId, { limit: 2 });

    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).toEqual(expect.any(String));
    expect(decodeCursor(result.pagination.next_cursor)).toEqual({
      id: older.id,
      sortKey: { weekStart: '2026-08-15' },
    });
  });

  it('decodes a valid cursor and hands it to the repository', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });
    const cursor = encodeCursor({
      id: older.id,
      sortKey: { weekStart: '2026-08-15' },
    });

    await useCase.execute(userId, { cursor });

    expect(repository.findOwnHistoryByUserId).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: older.id, sortKey: { weekStart: '2026-08-15' } },
      }),
    );
  });

  it.each([
    ['garbage', 'not-base64-json'],
    [
      'non-uuid id',
      encodeCursor({ id: 'nope', sortKey: { weekStart: '2026-08-15' } }),
    ],
    [
      'a daily cursor (reportDate instead of weekStart)',
      encodeCursor({ id: older.id, sortKey: { reportDate: '2026-08-15' } }),
    ],
    [
      'malformed date',
      encodeCursor({ id: older.id, sortKey: { weekStart: '15/08/2026' } }),
    ],
    [
      'SQL in the id',
      encodeCursor({
        id: "' OR 1=1 --",
        sortKey: { weekStart: '2026-08-15' },
      }),
    ],
  ])(
    'falls back to the first page on a malformed cursor (%s)',
    async (_label, cursor) => {
      repository.findOwnHistoryByUserId.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute(userId, { cursor });

      expect(repository.findOwnHistoryByUserId).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: null }),
      );
    },
  );

  it('returns an empty page (not an error) when the caller has no history', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    const result = await useCase.execute(userId, {});

    expect(result).toEqual({
      data: [],
      pagination: { next_cursor: null, has_more: false },
    });
  });
});
