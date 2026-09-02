/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-member-access */
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UpdateCoverageUseCase } from '../../../progress/application/update-coverage/update-coverage.use-case';
import { ICoverageRepository } from '../../../progress/domain/coverage.repository.interface';
import { ISurahRepository } from '../../../progress/domain/surah.repository.interface';
import { DailyReport } from '../../domain/daily-report.entity';
import {
  DailyReportRecord,
  IDailyReportRepository,
  TodayReportContextRecord,
} from '../../domain/daily-report.repository.interface';
import { DailyReportSubmittedEvent } from '../../domain/events/daily-report-submitted.event';
import { SubmitDailyReportDto } from './submit-daily-report.dto';
import { SubmitDailyReportUseCase } from './submit-daily-report.use-case';

describe('SubmitDailyReportUseCase (F-DR-02 / API-030)', () => {
  let useCase: SubmitDailyReportUseCase;
  let reports: jest.Mocked<IDailyReportRepository>;
  let surahs: jest.Mocked<ISurahRepository>;
  let coverage: jest.Mocked<ICoverageRepository>;
  let updateCoverage: { execute: jest.Mock };
  let events: { emit: jest.Mock };

  const userId = 'student-1';
  // Wednesday 2026-09-02 10:00 in Africa/Tunis (UTC+1).
  const now = new Date('2026-09-02T09:00:00.000Z');

  const context: TodayReportContextRecord = {
    membershipId: 'membership-1',
    groupId: 'group-1',
    groupLifecycleState: 'Active',
    recitationDay: 5, // Friday
    timezone: 'Africa/Tunis',
  };

  const existingRecord: DailyReportRecord = {
    id: 'report-existing',
    membershipId: 'membership-1',
    reportDate: '2026-09-02',
    type: 'Absent',
    submittedAt: '2026-09-02T07:00:00.000Z',
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
  };

  const normalDto: SubmitDailyReportDto = {
    type: 'Normal',
    memo_range: { from: { surah: 2, ayah: 1 }, to: { surah: 2, ayah: 20 } },
    memo_time: { from: '18:00', to: '18:45' },
    completed_50_repetitions: true,
    repetitions_in_single_session: true,
    rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
    rev_time: { from: '19:00', to: '19:10' },
    read_tafsir: false,
  };

  function dto(partial: Partial<SubmitDailyReportDto>): SubmitDailyReportDto {
    return partial as SubmitDailyReportDto;
  }

  async function failure<T extends Error>(
    promise: Promise<unknown>,
    type: new (...args: any[]) => T,
  ): Promise<Record<string, unknown>> {
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(type);
      return (err as T & { getResponse(): unknown }).getResponse() as Record<
        string,
        unknown
      >;
    }
    throw new Error('expected the use case to throw');
  }

  beforeEach(() => {
    reports = {
      findTodayContextByUserId: jest.fn().mockResolvedValue(context),
      findByMembershipAndDate: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue('report-new'),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
    };
    surahs = {
      findAll: jest.fn().mockResolvedValue([
        { number: 1, nameAr: 'الفاتحة', ayahCount: 7, ordinalOffset: 0 },
        { number: 2, nameAr: 'البقرة', ayahCount: 286, ordinalOffset: 7 },
      ]),
    };
    coverage = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn().mockResolvedValue({
        id: 'coverage-1',
        membershipId: 'membership-1',
        ahzabCompleted: 4,
        lastMemorizedOrdinal: null,
        updatedAt: new Date(),
        intervals: [],
      }),
      findActiveByUserId: jest.fn(),
      applyMerge: jest.fn(),
    };
    updateCoverage = {
      execute: jest.fn().mockResolvedValue({
        status: 'updated',
        membershipId: 'membership-1',
        ahzabCompleted: 5,
        lastMemorizedOrdinal: 27,
        intervals: [],
      }),
    };
    events = { emit: jest.fn() };
    useCase = new SubmitDailyReportUseCase(
      reports,
      surahs,
      coverage,
      updateCoverage as unknown as UpdateCoverageUseCase,
      events as unknown as EventEmitter2,
    );
  });

  describe('happy paths', () => {
    it('persists a Normal report, merges its memo range through DS-05 synchronously and returns the post-merge figure', async () => {
      const result = await useCase.execute(userId, normalDto, now);

      expect(reports.create).toHaveBeenCalledTimes(1);
      const stored = reports.create.mock.calls[0][0];
      expect(stored).toBeInstanceOf(DailyReport);
      expect(stored.reportDate).toBe('2026-09-02');
      expect(stored.submittedTimezone).toBe('Africa/Tunis');
      expect(stored.submittedAt).toBe(now);
      expect(stored.memoRange?.startOrdinal).toBe(8);
      expect(stored.memoRange?.endOrdinal).toBe(27);
      expect(stored.revRange?.startOrdinal).toBe(1);
      expect(stored.revRange?.endOrdinal).toBe(7);

      expect(updateCoverage.execute).toHaveBeenCalledWith({
        membershipId: 'membership-1',
        memoRange: {
          start: { surah: 2, ayah: 1 },
          end: { surah: 2, ayah: 20 },
        },
      });
      // The merge is invoked directly, after the insert — never via an event.
      expect(reports.create.mock.invocationCallOrder[0]).toBeLessThan(
        updateCoverage.execute.mock.invocationCallOrder[0],
      );
      expect(coverage.findByMembershipId).not.toHaveBeenCalled();

      expect(result).toEqual({
        data: {
          id: 'report-new',
          report_date: '2026-09-02',
          type: 'Normal',
          ahzab_completed: 5,
          coverage_updated: true,
        },
      });
    });

    it('emits DE-05 post-commit with the memo range (surah, ayah, ordinal)', async () => {
      await useCase.execute(userId, normalDto, now);

      expect(events.emit).toHaveBeenCalledWith(
        DailyReportSubmittedEvent.EVENT_NAME,
        expect.any(DailyReportSubmittedEvent),
      );
      const event = events.emit.mock.calls[0][1] as DailyReportSubmittedEvent;
      expect(event.membershipId).toBe('membership-1');
      expect(event.reportDate).toBe('2026-09-02');
      expect(event.type).toBe('Normal');
      expect(event.memoRange).toEqual({
        start: { surah: 2, ayah: 1, ordinal: 8 },
        end: { surah: 2, ayah: 20, ordinal: 27 },
      });
      expect(reports.create.mock.invocationCallOrder[0]).toBeLessThan(
        events.emit.mock.invocationCallOrder[0],
      );
    });

    it('accepts a Normal report with neither range (BR-48) and reports the stored ahzab figure without merging', async () => {
      const result = await useCase.execute(
        userId,
        dto({ type: 'Normal' }),
        now,
      );

      const stored = reports.create.mock.calls[0][0];
      expect(stored.noMemorizationToday).toBe(true);
      expect(stored.noRevisionToday).toBe(true);
      expect(updateCoverage.execute).not.toHaveBeenCalled();
      expect(coverage.findByMembershipId).toHaveBeenCalledWith('membership-1');
      expect(result.data).toEqual({
        id: 'report-new',
        report_date: '2026-09-02',
        type: 'Normal',
        ahzab_completed: 4,
        coverage_updated: false,
      });
      const event = events.emit.mock.calls[0][1] as DailyReportSubmittedEvent;
      expect(event.memoRange).toBeNull();
    });

    it('persists an Absent report with its reason and no coverage merge', async () => {
      const result = await useCase.execute(
        userId,
        dto({ type: 'Absent', absence_reason: 'Studying' }),
        now,
      );

      expect(reports.create.mock.calls[0][0].absenceReason).toBe('Studying');
      expect(updateCoverage.execute).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({
        type: 'Absent',
        ahzab_completed: 4,
        coverage_updated: false,
      });
    });

    it('persists a Revision report (rev range only) without touching coverage', async () => {
      const result = await useCase.execute(
        userId,
        dto({
          type: 'Revision',
          rev_range: { from: { surah: 1, ayah: 1 }, to: { surah: 2, ayah: 5 } },
          rev_time: { from: '20:00', to: '20:30' },
        }),
        now,
      );

      const stored = reports.create.mock.calls[0][0];
      expect(stored.revRange?.startOrdinal).toBe(1);
      expect(stored.revRange?.endOrdinal).toBe(12);
      expect(stored.memoRange).toBeNull();
      expect(updateCoverage.execute).not.toHaveBeenCalled();
      expect(result.data).toMatchObject({
        type: 'Revision',
        coverage_updated: false,
      });
    });

    it('accepts report_date equal to today in the student timezone (VR-10)', async () => {
      await expect(
        useCase.execute(
          userId,
          dto({
            type: 'Absent',
            absence_reason: 'Sick',
            report_date: '2026-09-02',
          }),
          now,
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('coverage failure never loses the report (UC-05 E5, ADR-029)', () => {
    it('returns coverage_updated=false with the previously stored figure when DS-05 throws', async () => {
      updateCoverage.execute.mockRejectedValue(new Error('deadlock detected'));

      const result = await useCase.execute(userId, normalDto, now);

      expect(reports.create).toHaveBeenCalledTimes(1);
      expect(result.data).toMatchObject({
        ahzab_completed: 4,
        coverage_updated: false,
      });
      expect(events.emit).toHaveBeenCalledTimes(1);
    });

    it('returns coverage_updated=false when DS-05 skips (no live coverage row)', async () => {
      updateCoverage.execute.mockResolvedValue({
        status: 'skipped',
        reason: 'COVERAGE_NOT_FOUND',
      });
      coverage.findByMembershipId.mockResolvedValue(null);

      const result = await useCase.execute(userId, normalDto, now);

      expect(result.data).toMatchObject({
        ahzab_completed: null,
        coverage_updated: false,
      });
    });
  });

  describe('preconditions', () => {
    it('403 when the caller has no Active membership (VR-35)', async () => {
      reports.findTodayContextByUserId.mockResolvedValue(null);

      const body = await failure(
        useCase.execute(userId, normalDto, now),
        ForbiddenException,
      );
      expect(body.error).toBe('SCOPE_DENIED');
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('403 when the group is Archived (FR-DR-11)', async () => {
      reports.findTodayContextByUserId.mockResolvedValue({
        ...context,
        groupLifecycleState: 'Archived',
      });

      const body = await failure(
        useCase.execute(userId, normalDto, now),
        ForbiddenException,
      );
      expect(body.error).toBe('SCOPE_DENIED');
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('422 RECITATION_DAY when today (student timezone) is the recitation day (VR-12)', async () => {
      reports.findTodayContextByUserId.mockResolvedValue({
        ...context,
        recitationDay: 3, // Wednesday
      });

      const body = await failure(
        useCase.execute(userId, normalDto, now),
        UnprocessableEntityException,
      );
      expect(body.error).toBe('RECITATION_DAY');
      expect(body.details).toBeUndefined();
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('422 BACKDATED when report_date is not today, with no grace period (VR-10)', async () => {
      // 2026-09-02T23:30Z is already 2026-09-03 in Africa/Tunis.
      const afterMidnight = new Date('2026-09-02T23:30:00.000Z');

      const body = await failure(
        useCase.execute(
          userId,
          dto({
            type: 'Absent',
            absence_reason: 'Sick',
            report_date: '2026-09-02',
          }),
          afterMidnight,
        ),
        UnprocessableEntityException,
      );
      expect(body.error).toBe('BACKDATED');
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('409 DUPLICATE_REPORT with the full existing report when one already exists today (pre-check)', async () => {
      reports.findByMembershipAndDate.mockResolvedValue(existingRecord);

      const body = await failure(
        useCase.execute(userId, normalDto, now),
        ConflictException,
      );
      expect(body.error).toBe('DUPLICATE_REPORT');
      expect(body.existing_report).toMatchObject({
        id: 'report-existing',
        report_date: '2026-09-02',
        type: 'Absent',
        absence_reason: 'Sick',
        memo_range: null,
      });
      expect(reports.create).not.toHaveBeenCalled();
      expect(updateCoverage.execute).not.toHaveBeenCalled();
    });

    it('translates a DB-UQ-04 violation on insert into the same 409 with the winning report (TS §20)', async () => {
      reports.findByMembershipAndDate
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingRecord);
      reports.create.mockRejectedValue(
        Object.assign(
          new Error(
            'duplicate key value violates unique constraint "DB-UQ-04"',
          ),
          {
            driverError: { code: '23505', constraint: 'DB-UQ-04' },
          },
        ),
      );

      const body = await failure(
        useCase.execute(userId, normalDto, now),
        ConflictException,
      );
      expect(body.error).toBe('DUPLICATE_REPORT');
      expect((body.existing_report as { id: string }).id).toBe(
        'report-existing',
      );
      expect(JSON.stringify(body)).not.toContain('duplicate key');
      expect(updateCoverage.execute).not.toHaveBeenCalled();
    });

    it('rethrows a non-unique insert failure untouched', async () => {
      reports.create.mockRejectedValue(new Error('connection reset'));

      await expect(useCase.execute(userId, normalDto, now)).rejects.toThrow(
        'connection reset',
      );
    });
  });

  describe('domain validation → 422 field-level details, nothing stored (UC-05 E1)', () => {
    it('Absent without a reason (VR-19)', async () => {
      const body = await failure(
        useCase.execute(userId, dto({ type: 'Absent' }), now),
        UnprocessableEntityException,
      );
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual([
        expect.objectContaining({ field: 'absence_reason', rule: 'VR-19' }),
      ]);
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('reverse-order range within a report (VR-14a / BR-52) via the shared AyahRange VO', async () => {
      const body = await failure(
        useCase.execute(
          userId,
          dto({
            ...normalDto,
            memo_range: {
              from: { surah: 2, ayah: 20 },
              to: { surah: 2, ayah: 1 },
            },
          }),
          now,
        ),
        UnprocessableEntityException,
      );
      expect(body.details).toEqual([
        expect.objectContaining({ field: 'memo_range', rule: 'VR-14a' }),
      ]);
      expect(reports.create).not.toHaveBeenCalled();
    });

    it('ayah outside the reference dataset (VR-13 / FR-PROG-05)', async () => {
      const body = await failure(
        useCase.execute(
          userId,
          dto({
            type: 'Revision',
            rev_range: {
              from: { surah: 1, ayah: 1 },
              to: { surah: 1, ayah: 8 },
            },
            rev_time: { from: '19:00', to: '19:10' },
          }),
          now,
        ),
        UnprocessableEntityException,
      );
      expect(body.details).toEqual([
        expect.objectContaining({ field: 'rev_range', rule: 'VR-13' }),
      ]);
    });

    it('time window with to <= from (VR-15)', async () => {
      const body = await failure(
        useCase.execute(
          userId,
          dto({ ...normalDto, memo_time: { from: '18:45', to: '18:00' } }),
          now,
        ),
        UnprocessableEntityException,
      );
      expect(body.details).toEqual([
        expect.objectContaining({ field: 'memo_time', rule: 'VR-15' }),
      ]);
    });

    it('repetitions_in_single_session=true without the 50 repetitions (VR-18)', async () => {
      const body = await failure(
        useCase.execute(
          userId,
          dto({
            ...normalDto,
            completed_50_repetitions: false,
            repetitions_in_single_session: true,
          }),
          now,
        ),
        UnprocessableEntityException,
      );
      expect(body.details).toEqual([
        expect.objectContaining({
          field: 'repetitions_in_single_session',
          rule: 'VR-18',
        }),
      ]);
    });
  });
});
