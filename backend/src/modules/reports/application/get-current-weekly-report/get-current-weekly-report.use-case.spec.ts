/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { IDailyReportRepository } from '../../domain/daily-report.repository.interface';
import { DatedDailyReportSnapshot } from '../../domain/weekly-metrics-calculator';
import {
  CurrentWeekContextRecord,
  IWeeklyReportRepository,
  WeeklyReportRecord,
} from '../../domain/weekly-report.repository.interface';
import { GetCurrentWeeklyReportUseCase } from './get-current-weekly-report.use-case';

describe('GetCurrentWeeklyReportUseCase (F-WR-01 / API-033)', () => {
  let useCase: GetCurrentWeeklyReportUseCase;
  let weeklyRepository: jest.Mocked<IWeeklyReportRepository>;
  let dailyRepository: jest.Mocked<IDailyReportRepository>;

  const userId = 'student-1';
  // Wednesday 2026-09-02 10:00 in Africa/Tunis (UTC+1).
  const wednesday = new Date('2026-09-02T09:00:00.000Z');
  // Friday 2026-09-04 10:00 in Africa/Tunis.
  const friday = new Date('2026-09-04T09:00:00.000Z');

  /** Recitation day Friday (5): the week Sat 2026-08-29 … Fri 2026-09-04. */
  const context: CurrentWeekContextRecord = {
    membershipId: 'membership-1',
    groupId: 'group-1',
    groupLifecycleState: 'Active',
    recitationDay: 5,
    archivedAt: null,
    startedAt: '2026-08-01',
    endedAt: null,
    timezone: 'Africa/Tunis',
  };

  const snapshot = (
    reportDate: string,
    overrides: Partial<DatedDailyReportSnapshot> = {},
  ): DatedDailyReportSnapshot => ({
    reportDate,
    type: 'Normal',
    absenceReason: null,
    noMemorizationToday: false,
    noRevisionToday: false,
    hasMemoRange: true,
    completed50Repetitions: true,
    repetitionsInSingleSession: true,
    ...overrides,
  });

  const storedRow: WeeklyReportRecord = {
    id: 'weekly-1',
    membershipId: 'membership-1',
    weekStart: '2026-08-29',
    weekEnd: '2026-09-04',
    expectedDays: 6,
    missedDailyReports: 2,
    missedDailyMemorization: 3,
    missedDailyRevision: 4,
    missed50Repetitions: 1,
    missedSingleSession: 0,
    attendedRecitationCall: false,
    state: 'Open',
    finalisedAt: null,
    finalisedBy: null,
  };

  beforeEach(() => {
    weeklyRepository = {
      findCurrentWeekContextByUserId: jest.fn(),
      findByMembershipAndWeekStart: jest.fn(),
      createIfAbsent: jest.fn(),
      findOwnById: jest.fn(),
      finaliseByStudent: jest.fn(),
      findAllOpenWithTimezone: jest.fn(),
      finaliseAsScheduler: jest.fn(),
    };
    dailyRepository = {
      findTodayContextByUserId: jest.fn(),
      findByMembershipAndDate: jest.fn(),
      create: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
      findDaySnapshotsByMembershipAndRange: jest.fn(),
    };
    useCase = new GetCurrentWeeklyReportUseCase(
      weeklyRepository,
      dailyRepository,
    );
  });

  it('answers 404 NOT_FOUND when the caller has no Active membership (APIQ-NEW-06 precedent)', async () => {
    weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(null);

    await expect(useCase.execute(userId, wednesday)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      weeklyRepository.findCurrentWeekContextByUserId,
    ).toHaveBeenCalledWith(userId);
    expect(
      dailyRepository.findDaySnapshotsByMembershipAndRange,
    ).not.toHaveBeenCalled();
    expect(weeklyRepository.createIfAbsent).not.toHaveBeenCalled();
  });

  describe('before the recitation day (live, DBD §14 / ADR-003)', () => {
    it('computes the metrics live over the week, id null, can_confirm false, nothing written', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue([
        snapshot('2026-08-29'),
        snapshot('2026-08-31', { type: 'Absent', absenceReason: 'Sick' }),
      ]);

      const result = await useCase.execute(userId, wednesday);

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-08-29', '2026-09-04');
      // Sat reported, Sun missed, Mon excused, Tue missed, Wed (today) missed.
      expect(result).toEqual({
        data: {
          id: null,
          week_start: '2026-08-29',
          week_end: '2026-09-04',
          expected_days: 5,
          missed_daily_reports: 3,
          missed_daily_memorization: 3,
          missed_daily_revision: 3,
          missed_50_repetitions: 0,
          missed_single_session: 0,
          attended_recitation_call: false,
          state: 'Open',
          can_confirm: false,
        },
      });
      expect(
        weeklyRepository.findByMembershipAndWeekStart,
      ).not.toHaveBeenCalled();
      expect(weeklyRepository.createIfAbsent).not.toHaveBeenCalled();
    });

    it('derives today from the student timezone, not UTC (T-01, INV-27)', async () => {
      // 2026-09-03T23:30Z is already Friday 2026-09-04 in Africa/Tunis — the
      // recitation day — so the stored path is taken, not the live one.
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(
        storedRow,
      );

      const result = await useCase.execute(
        userId,
        new Date('2026-09-03T23:30:00.000Z'),
      );

      expect(result.data.id).toBe('weekly-1');
      expect(result.data.can_confirm).toBe(true);
    });

    it('prorates expected days from started_at (FR-WR-09)', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue({
        ...context,
        startedAt: '2026-09-01',
      });
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        [],
      );

      const result = await useCase.execute(userId, wednesday);

      expect(result.data.expected_days).toBe(2);
      expect(result.data.missed_daily_reports).toBe(2);
    });
  });

  describe('on the recitation day (stored row, DBD §14 / ST-06)', () => {
    it('returns the existing row without recomputing, can_confirm true while Open', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(
        storedRow,
      );

      const result = await useCase.execute(userId, friday);

      expect(
        weeklyRepository.findByMembershipAndWeekStart,
      ).toHaveBeenCalledWith('membership-1', '2026-08-29');
      expect(result).toEqual({
        data: {
          id: 'weekly-1',
          week_start: '2026-08-29',
          week_end: '2026-09-04',
          expected_days: 6,
          missed_daily_reports: 2,
          missed_daily_memorization: 3,
          missed_daily_revision: 4,
          missed_50_repetitions: 1,
          missed_single_session: 0,
          attended_recitation_call: false,
          state: 'Open',
          can_confirm: true,
        },
      });
      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).not.toHaveBeenCalled();
      expect(weeklyRepository.createIfAbsent).not.toHaveBeenCalled();
    });

    it('creates the row lazily on first read with the six metrics computed once (E-06 "Create")', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(null);
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue([
        snapshot('2026-08-29', { repetitionsInSingleSession: false }),
        snapshot('2026-08-30', {
          completed50Repetitions: false,
          repetitionsInSingleSession: false,
          noRevisionToday: true,
        }),
        snapshot('2026-08-31', {
          type: 'Revision',
          hasMemoRange: false,
          noMemorizationToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
        snapshot('2026-09-01', { type: 'Absent', absenceReason: 'Sick' }),
        snapshot('2026-09-02', { type: 'Absent', absenceReason: 'Other' }),
      ]);
      weeklyRepository.createIfAbsent.mockImplementation((report) =>
        Promise.resolve({
          ...storedRow,
          id: 'weekly-new',
          expectedDays: report.metrics.expectedDays,
          missedDailyReports: report.metrics.missedDailyReports,
          missedDailyMemorization: report.metrics.missedDailyMemorization,
          missedDailyRevision: report.metrics.missedDailyRevision,
          missed50Repetitions: report.metrics.missed50Repetitions,
          missedSingleSession: report.metrics.missedSingleSession,
        }),
      );

      const result = await useCase.execute(userId, friday);

      expect(weeklyRepository.createIfAbsent).toHaveBeenCalledWith({
        membershipId: 'membership-1',
        weekStart: '2026-08-29',
        weekEnd: '2026-09-04',
        metrics: expect.objectContaining({
          expectedDays: 6,
          missedDailyReports: 1,
          missedDailyMemorization: 2,
          missedDailyRevision: 3,
          missed50Repetitions: 1,
          missedSingleSession: 1,
        }),
      });
      expect(result.data).toMatchObject({
        id: 'weekly-new',
        expected_days: 6,
        missed_daily_reports: 1,
        missed_daily_memorization: 2,
        missed_daily_revision: 3,
        missed_50_repetitions: 1,
        missed_single_session: 1,
        attended_recitation_call: false,
        state: 'Open',
        can_confirm: true,
      });
    });

    it('returns the row the concurrent first read created (DB-UQ-05 settles the race)', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(null);
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        [],
      );
      weeklyRepository.createIfAbsent.mockResolvedValue(storedRow);

      const result = await useCase.execute(userId, friday);

      expect(result.data.id).toBe('weekly-1');
      expect(result.data.missed_daily_reports).toBe(2);
    });

    it('never offers confirmation on a Finalised row (VR-36, EC-24)', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(
        context,
      );
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue({
        ...storedRow,
        state: 'Finalised',
        attendedRecitationCall: true,
        finalisedAt: '2026-09-04T10:00:00.000Z',
        finalisedBy: 'student-1',
      });

      const result = await useCase.execute(userId, friday);

      expect(result.data).toMatchObject({
        id: 'weekly-1',
        state: 'Finalised',
        attended_recitation_call: true,
        can_confirm: false,
      });
    });

    it('produces no row for an Archived group (BR-42, ST-06 guard) — live, truncated at archived_at', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue({
        ...context,
        groupLifecycleState: 'Archived',
        // Tuesday 2026-09-01 08:00 in Africa/Tunis.
        archivedAt: '2026-09-01T07:00:00.000Z',
      });
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(null);
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        [],
      );

      const result = await useCase.execute(userId, friday);

      expect(weeklyRepository.createIfAbsent).not.toHaveBeenCalled();
      // Sat … Tue = 4 expected days; Wed and Thu fall after the archive date.
      expect(result.data).toMatchObject({
        id: null,
        expected_days: 4,
        missed_daily_reports: 4,
        can_confirm: false,
      });
    });

    it('stores expected_days = 0 for a membership that starts on the recitation day (EC-13)', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue({
        ...context,
        startedAt: '2026-09-04',
      });
      weeklyRepository.findByMembershipAndWeekStart.mockResolvedValue(null);
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        [],
      );
      weeklyRepository.createIfAbsent.mockResolvedValue({
        ...storedRow,
        expectedDays: 0,
        missedDailyReports: 0,
        missedDailyMemorization: 0,
        missedDailyRevision: 0,
        missed50Repetitions: 0,
        missedSingleSession: 0,
      });

      await useCase.execute(userId, friday);

      expect(weeklyRepository.createIfAbsent).toHaveBeenCalledWith(
        expect.objectContaining({
          metrics: expect.objectContaining({
            expectedDays: 0,
            missedDailyReports: 0,
          }),
        }),
      );
    });
  });
});
