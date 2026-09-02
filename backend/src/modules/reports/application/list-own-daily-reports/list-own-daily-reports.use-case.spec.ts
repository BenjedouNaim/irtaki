/* eslint-disable @typescript-eslint/unbound-method */
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  DailyReportRecord,
  IDailyReportRepository,
} from '../../domain/daily-report.repository.interface';
import { ListOwnDailyReportsUseCase } from './list-own-daily-reports.use-case';

describe('ListOwnDailyReportsUseCase (F-DR-05 / API-031)', () => {
  let useCase: ListOwnDailyReportsUseCase;
  let repository: jest.Mocked<IDailyReportRepository>;

  const userId = 'student-1';

  function record(
    id: string,
    reportDate: string,
    overrides: Partial<DailyReportRecord> = {},
  ): DailyReportRecord {
    return {
      id,
      membershipId: 'membership-1',
      reportDate,
      type: 'Absent',
      submittedAt: `${reportDate}T08:30:00.000Z`,
      submittedTimezone: 'Africa/Tunis',
      noMemorizationToday: null,
      memoFrom: null,
      memoTo: null,
      memoTimeFrom: null,
      memoTimeTo: null,
      completed50Repetitions: null,
      repetitionsInSingleSession: null,
      noRevisionToday: null,
      revFrom: null,
      revTo: null,
      revTimeFrom: null,
      revTimeTo: null,
      readTafsir: null,
      absenceReason: 'Sick',
      ...overrides,
    };
  }

  const newer = record('01916362-e61e-7f61-8270-b74e892c90c2', '2026-09-02');
  const older = record('01916362-e61e-7f61-8270-b74e892c90c1', '2026-09-01', {
    type: 'Normal',
    noMemorizationToday: false,
    memoFrom: { surah: 2, ayah: 1 },
    memoTo: { surah: 2, ayah: 20 },
    memoTimeFrom: '18:00',
    memoTimeTo: '18:45',
    completed50Repetitions: true,
    repetitionsInSingleSession: false,
    noRevisionToday: true,
    readTafsir: false,
    absenceReason: null,
  });

  beforeEach(() => {
    repository = {
      findTodayContextByUserId: jest.fn(),
      findByMembershipAndDate: jest.fn(),
      create: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
    };
    useCase = new ListOwnDailyReportsUseCase(repository);
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

  it('maps rows through the DailyReportDto mapper (APIS §11: surah/ayah, wire names)', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [older],
      hasMore: false,
    });

    const result = await useCase.execute(userId, {});

    expect(result.data[0]).toEqual({
      id: older.id,
      report_date: '2026-09-01',
      type: 'Normal',
      submitted_at: '2026-09-01T08:30:00.000Z',
      submitted_timezone: 'Africa/Tunis',
      no_memorization_today: false,
      memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
      memo_time: { from: '18:00', to: '18:45' },
      completed_50_repetitions: true,
      repetitions_in_single_session: false,
      no_revision_today: true,
      rev_range: null,
      rev_time: null,
      read_tafsir: false,
      absence_reason: null,
    });
    expect(result.data[0]).not.toHaveProperty('membership_id');
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

  it('emits next_cursor = base64 {id, sortKey.reportDate} of the last row only when has_more (ISS-18)', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [newer, older],
      hasMore: true,
    });

    const result = await useCase.execute(userId, { limit: 2 });

    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).toEqual(expect.any(String));
    expect(decodeCursor(result.pagination.next_cursor)).toEqual({
      id: older.id,
      sortKey: { reportDate: '2026-09-01' },
    });
  });

  it('decodes a valid cursor and hands it to the repository', async () => {
    repository.findOwnHistoryByUserId.mockResolvedValue({
      rows: [],
      hasMore: false,
    });
    const cursor = encodeCursor({
      id: older.id,
      sortKey: { reportDate: '2026-09-01' },
    });

    await useCase.execute(userId, { cursor });

    expect(repository.findOwnHistoryByUserId).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: older.id, sortKey: { reportDate: '2026-09-01' } },
      }),
    );
  });

  it.each([
    ['garbage', 'not-base64-json'],
    [
      'non-uuid id',
      encodeCursor({ id: 'nope', sortKey: { reportDate: '2026-09-01' } }),
    ],
    [
      'missing reportDate',
      encodeCursor({ id: older.id, sortKey: { other: 1 } }),
    ],
    [
      'malformed date',
      encodeCursor({ id: older.id, sortKey: { reportDate: '01/09/2026' } }),
    ],
    [
      'SQL in the id',
      encodeCursor({
        id: "' OR 1=1 --",
        sortKey: { reportDate: '2026-09-01' },
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
