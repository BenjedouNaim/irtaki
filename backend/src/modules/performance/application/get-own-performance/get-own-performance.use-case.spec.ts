/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { IDailyReportRepository } from '../../../reports/domain/daily-report.repository.interface';
import { DatedDailyReportSnapshot } from '../../../reports/domain/weekly-metrics-calculator';
import {
  CurrentWeekContextRecord,
  IWeeklyReportRepository,
} from '../../../reports/domain/weekly-report.repository.interface';
import { GetOwnPerformanceUseCase } from './get-own-performance.use-case';

describe('GetOwnPerformanceUseCase (F-PERF-01 / API-037)', () => {
  let useCase: GetOwnPerformanceUseCase;
  let weeklyRepository: jest.Mocked<IWeeklyReportRepository>;
  let dailyRepository: jest.Mocked<IDailyReportRepository>;

  const userId = 'student-1';
  /** Wednesday 2026-09-02 10:00 in Africa/Tunis (UTC+1). */
  const wednesday = new Date('2026-09-02T09:00:00.000Z');

  /** Recitation day Friday (5): the week Sat 2026-08-29 … Fri 2026-09-04. */
  const context: CurrentWeekContextRecord = {
    membershipId: 'membership-1',
    groupId: 'group-1',
    groupLifecycleState: 'Active',
    recitationDay: 5,
    archivedAt: null,
    startedAt: '2026-01-01',
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

  /** Sat 29 Aug … Wed 2 Sep — the five expected days already reached. */
  const weekSoFar = [
    '2026-08-29',
    '2026-08-30',
    '2026-08-31',
    '2026-09-01',
    '2026-09-02',
  ];

  beforeEach(() => {
    weeklyRepository = {
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
    dailyRepository = {
      findTodayContextByUserId: jest.fn(),
      findByMembershipAndDate: jest.fn(),
      create: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
      findDaySnapshotsByMembershipAndRange: jest.fn(),
      findLastReportDateByMembershipId: jest.fn(),
    };
    weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(context);
    weeklyRepository.countAttendedFinalisedWeeks.mockResolvedValue(0);
    dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue([]);
    dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(null);
    useCase = new GetOwnPerformanceUseCase(weeklyRepository, dailyRepository);
  });

  it('answers 404 NOT_FOUND when the caller has no Active membership', async () => {
    weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue(null);

    await expect(useCase.execute(userId, {}, wednesday)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(
      dailyRepository.findDaySnapshotsByMembershipAndRange,
    ).not.toHaveBeenCalled();
  });

  describe('period resolution (?period=, FR-PERF-03)', () => {
    it('defaults to the current reporting week and reads only that range', async () => {
      await useCase.execute(userId, {}, wednesday);

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-08-29', '2026-09-04');
      expect(weeklyRepository.countAttendedFinalisedWeeks).toHaveBeenCalledWith(
        'membership-1',
        '2026-08-29',
        '2026-08-29',
      );
    });

    it('reads one month of reporting weeks for period=month', async () => {
      await useCase.execute(userId, { period: 'month' }, wednesday);

      // 2026-08-02 … 2026-09-02 spans the weeks starting 2026-08-01 … 2026-08-29.
      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-08-01', '2026-09-04');
      expect(weeklyRepository.countAttendedFinalisedWeeks).toHaveBeenCalledWith(
        'membership-1',
        '2026-08-01',
        '2026-08-29',
      );
    });

    it('reads three months of reporting weeks for period=3months', async () => {
      await useCase.execute(userId, { period: '3months' }, wednesday);

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-05-30', '2026-09-04');
    });

    it('uses the caller’s own range for period=custom', async () => {
      await useCase.execute(
        userId,
        { period: 'custom', from: '2026-08-01', to: '2026-08-14' },
        wednesday,
      );

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-08-01', '2026-08-14');
    });

    it('clamps the period to [started_at, today] (FR-PERF-07, DEC-A10)', async () => {
      weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue({
        ...context,
        startedAt: '2026-08-31',
      });

      await useCase.execute(
        userId,
        { period: 'custom', from: '2020-01-01', to: '2099-12-31' },
        wednesday,
      );

      // Weeks are enumerated from the membership start to today only.
      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith('membership-1', '2026-08-29', '2026-09-04');
    });

    it('reads nothing when the clamped period is empty', async () => {
      await useCase.execute(
        userId,
        { period: 'custom', from: '2026-09-10', to: '2026-09-20' },
        wednesday,
      );

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).not.toHaveBeenCalled();
      expect(
        weeklyRepository.countAttendedFinalisedWeeks,
      ).not.toHaveBeenCalled();
    });
  });

  describe('the response (APIS §10.9)', () => {
    it('returns every rate for a perfect week inside the envelope', async () => {
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        weekSoFar.map((d) => snapshot(d)),
      );
      dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(
        '2026-09-02',
      );
      weeklyRepository.countAttendedFinalisedWeeks.mockResolvedValue(1);

      const result = await useCase.execute(userId, {}, wednesday);

      expect(result).toEqual({
        data: {
          commitment_score: 100,
          submission_rate: 100,
          memorization_rate: 100,
          revision_rate: 100,
          attendance_rate: 100,
          repetition_quality: 100,
          day_breakdown: {
            normal: 5,
            revision: 0,
            absent_excused: 0,
            absent_other: 0,
            no_report: 0,
          },
          days_since_last_report: 0,
        },
      });
    });

    it('leaves every undefined rate null, never 0 (DEC-B04 / API-X07)', async () => {
      // Every reached day excused: D_eff, D_memo and the memorization days
      // are all empty, and no weekly report is finalised.
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        weekSoFar.map((d) =>
          snapshot(d, {
            type: 'Absent',
            absenceReason: 'Sick',
            hasMemoRange: false,
            noMemorizationToday: null,
            noRevisionToday: null,
            completed50Repetitions: null,
            repetitionsInSingleSession: null,
          }),
        ),
      );
      weeklyRepository.countAttendedFinalisedWeeks.mockResolvedValue(0);

      const result = await useCase.execute(userId, {}, wednesday);

      expect(result.data.submission_rate).toBeNull();
      expect(result.data.memorization_rate).toBeNull();
      expect(result.data.revision_rate).toBeNull();
      expect(result.data.repetition_quality).toBeNull();
      // W(P) is not empty — one reporting week, none attended: a REAL 0 %.
      expect(result.data.attendance_rate).toBe(0);
      expect(result.data.commitment_score).toBe(0);
      expect(result.data.day_breakdown.absent_excused).toBe(5);
    });

    it('returns a null score when the period contains no data at all', async () => {
      const result = await useCase.execute(
        userId,
        { period: 'custom', from: '2026-09-10', to: '2026-09-20' },
        wednesday,
      );

      expect(result.data).toMatchObject({
        commitment_score: null,
        submission_rate: null,
        memorization_rate: null,
        revision_rate: null,
        attendance_rate: null,
        repetition_quality: null,
        day_breakdown: {
          normal: 0,
          revision: 0,
          absent_excused: 0,
          absent_other: 0,
          no_report: 0,
        },
      });
    });

    it('day_breakdown sums to the expected days of the period', async () => {
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue([
        snapshot('2026-08-29'),
        snapshot('2026-08-30', {
          type: 'Revision',
          hasMemoRange: false,
          noMemorizationToday: null,
          noRevisionToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
        snapshot('2026-08-31', {
          type: 'Absent',
          absenceReason: 'Sick',
          hasMemoRange: false,
          noMemorizationToday: null,
          noRevisionToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
        snapshot('2026-09-01', {
          type: 'Absent',
          absenceReason: 'Other',
          hasMemoRange: false,
          noMemorizationToday: null,
          noRevisionToday: null,
          completed50Repetitions: null,
          repetitionsInSingleSession: null,
        }),
        // 2026-09-02 left unreported.
      ]);

      const { day_breakdown } = (await useCase.execute(userId, {}, wednesday))
        .data;

      expect(day_breakdown).toEqual({
        normal: 1,
        revision: 1,
        absent_excused: 1,
        absent_other: 1,
        no_report: 1,
      });
      // Five expected days reached so far this week (the window ends today).
      expect(
        day_breakdown.normal +
          day_breakdown.revision +
          day_breakdown.absent_excused +
          day_breakdown.absent_other +
          day_breakdown.no_report,
      ).toBe(5);
    });

    it('counts days_since_last_report in expected days, skipping the recitation day', async () => {
      dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(
        '2026-08-27',
      );

      const result = await useCase.execute(userId, {}, wednesday);

      // Fri 28 Aug is the recitation day; Sat 29 … Wed 2 Sep is five days.
      expect(result.data.days_since_last_report).toBe(5);
    });

    it('reports recency from today even when the period is historical', async () => {
      dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(
        '2026-09-01',
      );

      const result = await useCase.execute(
        userId,
        { period: 'custom', from: '2026-02-01', to: '2026-02-28' },
        wednesday,
      );

      expect(result.data.days_since_last_report).toBe(1);
    });
  });

  it('truncates the day sets at an archived group’s archive date (FR-WR-10)', async () => {
    weeklyRepository.findCurrentWeekContextByUserId.mockResolvedValue({
      ...context,
      groupLifecycleState: 'Archived',
      archivedAt: '2026-08-31T12:00:00.000Z',
    });
    dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
      weekSoFar.map((d) => snapshot(d)),
    );

    const result = await useCase.execute(userId, {}, wednesday);

    // Only Sat 29, Sun 30 and Mon 31 are inside EffectiveWindow.
    expect(result.data.day_breakdown.normal).toBe(3);
  });
});
