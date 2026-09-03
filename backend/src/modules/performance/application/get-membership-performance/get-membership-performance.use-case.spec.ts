/* eslint-disable @typescript-eslint/unbound-method */
import { NotFoundException } from '@nestjs/common';
import { IDailyReportRepository } from '../../../reports/domain/daily-report.repository.interface';
import { DatedDailyReportSnapshot } from '../../../reports/domain/weekly-metrics-calculator';
import { IWeeklyReportRepository } from '../../../reports/domain/weekly-report.repository.interface';
import {
  IMembershipPerformanceRepository,
  MembershipPerformanceContextRecord,
} from '../../domain/membership-performance.repository.interface';
import { GetMembershipPerformanceUseCase } from './get-membership-performance.use-case';

describe('GetMembershipPerformanceUseCase (F-PERF-03 / API-039)', () => {
  let useCase: GetMembershipPerformanceUseCase;
  let membershipRepository: jest.Mocked<IMembershipPerformanceRepository>;
  let weeklyRepository: jest.Mocked<IWeeklyReportRepository>;
  let dailyRepository: jest.Mocked<IDailyReportRepository>;

  const membershipId = 'membership-1';
  /** Wednesday 2026-09-02 10:00 in Africa/Tunis (UTC+1). */
  const wednesday = new Date('2026-09-02T09:00:00.000Z');

  /** Recitation day Friday (5): the week Sat 2026-08-29 … Fri 2026-09-04. */
  const context: MembershipPerformanceContextRecord = {
    membershipId,
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
    membershipRepository = { findContext: jest.fn() };
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
    membershipRepository.findContext.mockResolvedValue(context);
    weeklyRepository.countAttendedFinalisedWeeks.mockResolvedValue(0);
    dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue([]);
    dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(null);
    useCase = new GetMembershipPerformanceUseCase(
      membershipRepository,
      weeklyRepository,
      dailyRepository,
    );
  });

  it('answers 404 NOT_FOUND when the id names no membership (the Admin path, APIS §9.6)', async () => {
    membershipRepository.findContext.mockResolvedValue(null);

    await expect(
      useCase.execute(membershipId, {}, wednesday),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      dailyRepository.findDaySnapshotsByMembershipAndRange,
    ).not.toHaveBeenCalled();
  });

  it('never resolves the caller: the guarded path id IS the scope (TS §15.2 step 4)', async () => {
    await useCase.execute(membershipId, {}, wednesday);

    expect(membershipRepository.findContext).toHaveBeenCalledWith(membershipId);
    expect(
      weeklyRepository.findCurrentWeekContextByUserId,
    ).not.toHaveBeenCalled();
    expect(
      dailyRepository.findDaySnapshotsByMembershipAndRange,
    ).toHaveBeenCalledWith(membershipId, '2026-08-29', '2026-09-04');
  });

  describe('period resolution (?period=, FR-PERF-03)', () => {
    it('defaults to the current reporting week', async () => {
      await useCase.execute(membershipId, {}, wednesday);

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith(membershipId, '2026-08-29', '2026-09-04');
      // The running week has not reached its recitation day (Fri 4 Sep), so
      // `weeks elapsed` is 0 and attendance is not read at all (EC-44).
      expect(
        weeklyRepository.countAttendedFinalisedWeeks,
      ).not.toHaveBeenCalled();
    });

    it('reads one month of reporting weeks for period=month', async () => {
      await useCase.execute(membershipId, { period: 'month' }, wednesday);

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith(membershipId, '2026-08-01', '2026-09-04');
      expect(weeklyRepository.countAttendedFinalisedWeeks).toHaveBeenCalledWith(
        membershipId,
        '2026-08-01',
        '2026-08-22',
      );
    });

    it('honours a custom range, resolved to whole reporting weeks', async () => {
      await useCase.execute(
        membershipId,
        { period: 'custom', from: '2026-08-10', to: '2026-08-20' },
        wednesday,
      );

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith(membershipId, '2026-08-08', '2026-08-21');
    });
  });

  describe('the student’s own timezone decides "today" (T-01, INV-27)', () => {
    it('measures the period from the STUDENT’s day, not the reader’s', async () => {
      // 2026-09-03T00:30Z is still Wed 2 Sep in Honolulu (UTC-10), so the
      // reporting week is the one containing Wed 2 Sep, not Thu 3 Sep.
      membershipRepository.findContext.mockResolvedValue({
        ...context,
        timezone: 'Pacific/Honolulu',
      });

      await useCase.execute(
        membershipId,
        {},
        new Date('2026-09-03T00:30:00.000Z'),
      );

      expect(
        dailyRepository.findDaySnapshotsByMembershipAndRange,
      ).toHaveBeenCalledWith(membershipId, '2026-08-29', '2026-09-04');
    });
  });

  describe('the payload is API-037’s verbatim (APIS §10.9)', () => {
    it('returns every field inside the §9.1 envelope', async () => {
      dailyRepository.findDaySnapshotsByMembershipAndRange.mockResolvedValue(
        weekSoFar.map((date) => snapshot(date)),
      );
      dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(
        '2026-09-02',
      );

      const result = await useCase.execute(membershipId, {}, wednesday);

      expect(Object.keys(result)).toEqual(['data']);
      expect(result.data).toEqual({
        commitment_score: 100,
        submission_rate: 100,
        memorization_rate: 100,
        revision_rate: 100,
        attendance_rate: null,
        repetition_quality: 100,
        day_breakdown: {
          normal: 5,
          revision: 0,
          absent_excused: 0,
          absent_other: 0,
          no_report: 0,
        },
        days_since_last_report: 0,
      });
    });

    it('leaves an undefined rate null, never 0 (DEC-B04 / API-X07)', async () => {
      const result = await useCase.execute(membershipId, {}, wednesday);

      expect(result.data.attendance_rate).toBeNull();
      expect(result.data.repetition_quality).toBeNull();
      expect(result.data.memorization_rate).toBe(0);
      expect(result.data.day_breakdown.no_report).toBe(5);
    });

    it('counts days_since_last_report in EXPECTED days from today (SAS §18.4)', async () => {
      dailyRepository.findLastReportDateByMembershipId.mockResolvedValue(
        '2026-08-30',
      );

      const result = await useCase.execute(
        membershipId,
        { period: 'month' },
        wednesday,
      );

      // 31 Aug, 1 Sep, 2 Sep — the recitation day (Friday) is never expected.
      expect(result.data.days_since_last_report).toBe(3);
    });
  });

  it('stores nothing — DS-03 is recomputed on every call (TS §24, DBD §68)', async () => {
    await useCase.execute(membershipId, {}, wednesday);
    await useCase.execute(membershipId, {}, wednesday);

    expect(weeklyRepository.createIfAbsent).not.toHaveBeenCalled();
    expect(weeklyRepository.finaliseAsScheduler).not.toHaveBeenCalled();
    expect(dailyRepository.create).not.toHaveBeenCalled();
  });
});
