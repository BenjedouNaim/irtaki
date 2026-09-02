/* eslint-disable @typescript-eslint/unbound-method */
import {
  IMembershipRepository,
  MembershipRecoveryData,
} from '../../domain/membership.repository.interface';
import { GetRecoveryUseCase } from './get-recovery.use-case';

describe('GetRecoveryUseCase', () => {
  let useCase: GetRecoveryUseCase;
  let membershipRepository: jest.Mocked<IMembershipRepository>;

  const terminatedMembershipWithEmptyHistory: MembershipRecoveryData = {
    membership: {
      id: 'membership-terminated-1',
      user: {
        id: 'user-1',
        fullName: 'Ahmed Ali',
        gender: 'Male',
      },
      group: {
        id: 'group-1',
        name: 'حلقة الإمام قالون',
        recitationDay: 5,
        enrollmentStatus: 'Open',
      },
      state: 'Terminated',
      startedAt: '2026-06-01',
      endedAt: '2026-08-01',
      endedBy: 'admin-1',
    },
    dailyReports: [],
    weeklyReports: [],
    paymentRecords: [],
  };

  const terminatedMembershipWithPopulatedHistory: MembershipRecoveryData = {
    membership: {
      id: 'membership-terminated-2',
      user: {
        id: 'user-2',
        fullName: 'Fatima Zahra',
        gender: 'Female',
      },
      group: {
        id: 'group-2',
        name: 'حلقة الإمام نافع',
        recitationDay: 3,
        enrollmentStatus: 'Closed',
      },
      state: 'Terminated',
      startedAt: '2026-05-01',
      endedAt: '2026-08-15',
      endedBy: 'admin-1',
    },
    dailyReports: [
      {
        id: 'daily-report-1',
        membershipId: 'membership-terminated-2',
        reportDate: '2026-05-02',
        type: 'Normal',
        submittedAt: '2026-05-02T10:00:00.000Z',
        submittedTimezone: 'Africa/Tunis',
        noMemorizationToday: false,
        memoFromOrdinal: 1,
        memoToOrdinal: 10,
        memoTimeFrom: '09:00:00',
        memoTimeTo: '09:45:00',
        completed50Repetitions: true,
        repetitionsInSingleSession: true,
        noRevisionToday: false,
        revFromOrdinal: 1,
        revToOrdinal: 5,
        revTimeFrom: '10:00:00',
        revTimeTo: '10:30:00',
        readTafsir: true,
        absenceReason: null,
        deletedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
    weeklyReports: [
      {
        id: 'weekly-report-1',
        membershipId: 'membership-terminated-2',
        weekStart: '2026-05-01',
        weekEnd: '2026-05-07',
        expectedDays: 6,
        missedDailyReports: 0,
        missedDailyMemorization: 0,
        missedDailyRevision: 0,
        missed50Repetitions: 0,
        missedSingleSession: 0,
        attendedRecitationCall: true,
        state: 'Finalised',
        finalisedAt: '2026-05-07T18:00:00.000Z',
        finalisedBy: 'teacher-1',
        deletedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
    paymentRecords: [
      {
        id: 'payment-1',
        membershipId: 'membership-terminated-2',
        cycleIndex: 0,
        amount: '30.00',
        paidAt: '2026-05-01T11:00:00.000Z',
        recordedBy: 'assistant-1',
        deletedAt: '2026-08-15T12:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    membershipRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findRosterByGroupId: jest.fn(),
      findByIdForRecovery: jest.fn(),
      findStateAndUserById: jest.fn(),
      terminateConditionally: jest.fn(),
      softDeleteMembershipRecords: jest.fn(),
    };
    useCase = new GetRecoveryUseCase(membershipRepository);
  });

  it('returns recovery view with empty history arrays when no reports exist', async () => {
    membershipRepository.findByIdForRecovery.mockResolvedValue(
      terminatedMembershipWithEmptyHistory,
    );

    const result = await useCase.execute('membership-terminated-1');

    expect(result).toEqual({
      data: {
        membership: {
          id: 'membership-terminated-1',
          user: {
            id: 'user-1',
            full_name: 'Ahmed Ali',
            gender: 'Male',
          },
          group: {
            id: 'group-1',
            name: 'حلقة الإمام قالون',
            recitation_day: 5,
            enrollment_status: 'Open',
          },
          state: 'Terminated',
          started_at: '2026-06-01',
          ended_at: '2026-08-01',
          ended_by: 'admin-1',
        },
        daily_reports: [],
        weekly_reports: [],
        payment_records: [],
      },
    });
    expect(membershipRepository.findByIdForRecovery).toHaveBeenCalledWith(
      'membership-terminated-1',
    );
  });

  it('returns recovery view with mapped history entries when reports exist', async () => {
    membershipRepository.findByIdForRecovery.mockResolvedValue(
      terminatedMembershipWithPopulatedHistory,
    );

    const result = await useCase.execute('membership-terminated-2');

    expect(result).toEqual({
      data: {
        membership: {
          id: 'membership-terminated-2',
          user: {
            id: 'user-2',
            full_name: 'Fatima Zahra',
            gender: 'Female',
          },
          group: {
            id: 'group-2',
            name: 'حلقة الإمام نافع',
            recitation_day: 3,
            enrollment_status: 'Closed',
          },
          state: 'Terminated',
          started_at: '2026-05-01',
          ended_at: '2026-08-15',
          ended_by: 'admin-1',
        },
        daily_reports: [
          {
            id: 'daily-report-1',
            membership_id: 'membership-terminated-2',
            report_date: '2026-05-02',
            type: 'Normal',
            submitted_at: '2026-05-02T10:00:00.000Z',
            submitted_timezone: 'Africa/Tunis',
            no_memorization_today: false,
            memo_from_ordinal: 1,
            memo_to_ordinal: 10,
            memo_time_from: '09:00:00',
            memo_time_to: '09:45:00',
            completed_50_repetitions: true,
            repetitions_in_single_session: true,
            no_revision_today: false,
            rev_from_ordinal: 1,
            rev_to_ordinal: 5,
            rev_time_from: '10:00:00',
            rev_time_to: '10:30:00',
            read_tafsir: true,
            absence_reason: null,
            deleted_at: '2026-08-15T12:00:00.000Z',
          },
        ],
        weekly_reports: [
          {
            id: 'weekly-report-1',
            membership_id: 'membership-terminated-2',
            week_start: '2026-05-01',
            week_end: '2026-05-07',
            expected_days: 6,
            missed_daily_reports: 0,
            missed_daily_memorization: 0,
            missed_daily_revision: 0,
            missed_50_repetitions: 0,
            missed_single_session: 0,
            attended_recitation_call: true,
            state: 'Finalised',
            finalised_at: '2026-05-07T18:00:00.000Z',
            finalised_by: 'teacher-1',
            deleted_at: '2026-08-15T12:00:00.000Z',
          },
        ],
        payment_records: [
          {
            id: 'payment-1',
            membership_id: 'membership-terminated-2',
            cycle_index: 0,
            amount: '30.00',
            paid_at: '2026-05-01T11:00:00.000Z',
            recorded_by: 'assistant-1',
            deleted_at: '2026-08-15T12:00:00.000Z',
          },
        ],
      },
    });
  });

  it('throws 404 NOT_FOUND when the membership does not exist', async () => {
    membershipRepository.findByIdForRecovery.mockResolvedValue(null);

    await expect(useCase.execute('non-existent-id')).rejects.toMatchObject({
      response: {
        statusCode: 404,
        error: 'NOT_FOUND',
      },
    });
  });
});
