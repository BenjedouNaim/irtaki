/* eslint-disable @typescript-eslint/unbound-method */
import {
  DailyReportRecord,
  IDailyReportRepository,
  TodayReportContextRecord,
} from '../../domain/daily-report.repository.interface';
import { GetTodayReportStatusUseCase } from './get-today-report-status.use-case';

describe('GetTodayReportStatusUseCase (F-DR-01 / API-029)', () => {
  let useCase: GetTodayReportStatusUseCase;
  let repository: jest.Mocked<IDailyReportRepository>;

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

  const report: DailyReportRecord = {
    id: 'report-1',
    membershipId: 'membership-1',
    reportDate: '2026-09-02',
    type: 'Normal',
    submittedAt: '2026-09-02T08:30:00.000Z',
    submittedTimezone: 'Africa/Tunis',
    noMemorizationToday: false,
    memoFrom: { surah: 2, ayah: 1 },
    memoTo: { surah: 2, ayah: 20 },
    memoTimeFrom: '18:00',
    memoTimeTo: '18:45',
    completed50Repetitions: true,
    repetitionsInSingleSession: true,
    noRevisionToday: true,
    revFrom: null,
    revTo: null,
    revTimeFrom: null,
    revTimeTo: null,
    readTafsir: false,
    absenceReason: null,
  };

  beforeEach(() => {
    repository = {
      findTodayContextByUserId: jest.fn(),
      findByMembershipAndDate: jest.fn(),
    };
    useCase = new GetTodayReportStatusUseCase(repository);
  });

  it('returns can_submit=true with no optional keys when every precondition holds', async () => {
    repository.findTodayContextByUserId.mockResolvedValue(context);
    repository.findByMembershipAndDate.mockResolvedValue(null);

    const result = await useCase.execute(userId, now);

    expect(repository.findTodayContextByUserId).toHaveBeenCalledWith(userId);
    expect(repository.findByMembershipAndDate).toHaveBeenCalledWith(
      'membership-1',
      '2026-09-02',
    );
    expect(result).toEqual({ data: { can_submit: true } });
    expect(result.data).not.toHaveProperty('block_reason');
    expect(result.data).not.toHaveProperty('existing_report');
  });

  it('returns membership_inactive when the caller has no Active membership (VR-35)', async () => {
    repository.findTodayContextByUserId.mockResolvedValue(null);

    const result = await useCase.execute(userId, now);

    expect(result).toEqual({
      data: { can_submit: false, block_reason: 'membership_inactive' },
    });
    expect(repository.findByMembershipAndDate).not.toHaveBeenCalled();
  });

  it('returns group_archived without consulting the report table (FR-DR-11)', async () => {
    repository.findTodayContextByUserId.mockResolvedValue({
      ...context,
      groupLifecycleState: 'Archived',
    });

    const result = await useCase.execute(userId, now);

    expect(result).toEqual({
      data: { can_submit: false, block_reason: 'group_archived' },
    });
    expect(repository.findByMembershipAndDate).not.toHaveBeenCalled();
  });

  it('returns recitation_day when today (in the student timezone) is the group recitation day (VR-12)', async () => {
    repository.findTodayContextByUserId.mockResolvedValue({
      ...context,
      recitationDay: 3, // Wednesday
    });

    const result = await useCase.execute(userId, now);

    expect(result).toEqual({
      data: { can_submit: false, block_reason: 'recitation_day' },
    });
    expect(repository.findByMembershipAndDate).not.toHaveBeenCalled();
  });

  it('evaluates the day boundary in User.timezone, not UTC (T-01, INV-27)', async () => {
    // 2026-09-03T23:30Z is still Thursday in UTC but already Friday (5) in Africa/Tunis.
    const lateEvening = new Date('2026-09-03T23:30:00.000Z');
    repository.findTodayContextByUserId.mockResolvedValue({
      ...context,
      recitationDay: 5,
    });

    const result = await useCase.execute(userId, lateEvening);

    expect(result.data.block_reason).toBe('recitation_day');

    // Same instant for a student persisted in UTC: Thursday, so the lookup
    // runs for 2026-09-03.
    repository.findTodayContextByUserId.mockResolvedValue({
      ...context,
      recitationDay: 5,
      timezone: 'UTC',
    });
    repository.findByMembershipAndDate.mockResolvedValue(null);

    const utcResult = await useCase.execute(userId, lateEvening);

    expect(utcResult.data.can_submit).toBe(true);
    expect(repository.findByMembershipAndDate).toHaveBeenCalledWith(
      'membership-1',
      '2026-09-03',
    );
  });

  it('returns already_submitted with the full existing report as a DailyReportDto (AC-07)', async () => {
    repository.findTodayContextByUserId.mockResolvedValue(context);
    repository.findByMembershipAndDate.mockResolvedValue(report);

    const result = await useCase.execute(userId, now);

    expect(result).toEqual({
      data: {
        can_submit: false,
        block_reason: 'already_submitted',
        existing_report: {
          id: 'report-1',
          report_date: '2026-09-02',
          type: 'Normal',
          submitted_at: '2026-09-02T08:30:00.000Z',
          submitted_timezone: 'Africa/Tunis',
          no_memorization_today: false,
          memo_range: {
            from: { surah: 2, ayah: 1 },
            to: { surah: 2, ayah: 20 },
          },
          memo_time: { from: '18:00', to: '18:45' },
          completed_50_repetitions: true,
          repetitions_in_single_session: true,
          no_revision_today: true,
          rev_range: null,
          rev_time: null,
          read_tafsir: false,
          absence_reason: null,
        },
      },
    });
    // Ordinals never leave the API (APIS §11).
    expect(JSON.stringify(result)).not.toContain('ordinal');
  });
});
