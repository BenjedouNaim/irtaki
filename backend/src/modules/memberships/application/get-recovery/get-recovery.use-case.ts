import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../../domain/membership.repository.interface';
import { GetMembershipRecoveryResponseDto } from './get-recovery-response.dto';

@Injectable()
export class GetRecoveryUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
  ) {}

  async execute(id: string): Promise<GetMembershipRecoveryResponseDto> {
    const data = await this.membershipRepository.findByIdForRecovery(id);

    if (!data) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    return {
      data: {
        membership: {
          id: data.membership.id,
          user: {
            id: data.membership.user.id,
            full_name: data.membership.user.fullName,
            gender: data.membership.user.gender,
          },
          group: {
            id: data.membership.group.id,
            name: data.membership.group.name,
            recitation_day: data.membership.group.recitationDay,
            enrollment_status: data.membership.group.enrollmentStatus,
          },
          state: data.membership.state,
          started_at: data.membership.startedAt,
          ended_at: data.membership.endedAt,
          ended_by: data.membership.endedBy,
        },
        daily_reports: data.dailyReports.map((r) => ({
          id: r.id,
          membership_id: r.membershipId,
          report_date: r.reportDate,
          type: r.type,
          submitted_at: r.submittedAt,
          submitted_timezone: r.submittedTimezone,
          no_memorization_today: r.noMemorizationToday,
          memo_from_ordinal: r.memoFromOrdinal,
          memo_to_ordinal: r.memoToOrdinal,
          memo_time_from: r.memoTimeFrom,
          memo_time_to: r.memoTimeTo,
          completed_50_repetitions: r.completed50Repetitions,
          repetitions_in_single_session: r.repetitionsInSingleSession,
          no_revision_today: r.noRevisionToday,
          rev_from_ordinal: r.revFromOrdinal,
          rev_to_ordinal: r.revToOrdinal,
          rev_time_from: r.revTimeFrom,
          rev_time_to: r.revTimeTo,
          read_tafsir: r.readTafsir,
          absence_reason: r.absenceReason,
          deleted_at: r.deletedAt,
        })),
        weekly_reports: data.weeklyReports.map((r) => ({
          id: r.id,
          membership_id: r.membershipId,
          week_start: r.weekStart,
          week_end: r.weekEnd,
          expected_days: r.expectedDays,
          missed_daily_reports: r.missedDailyReports,
          missed_daily_memorization: r.missedDailyMemorization,
          missed_daily_revision: r.missedDailyRevision,
          missed_50_repetitions: r.missed50Repetitions,
          missed_single_session: r.missedSingleSession,
          attended_recitation_call: r.attendedRecitationCall,
          state: r.state,
          finalised_at: r.finalisedAt,
          finalised_by: r.finalisedBy,
          deleted_at: r.deletedAt,
        })),
        payment_records: data.paymentRecords.map((r) => ({
          id: r.id,
          membership_id: r.membershipId,
          cycle_index: r.cycleIndex,
          amount: r.amount,
          paid_at: r.paidAt,
          recorded_by: r.recordedBy,
          deleted_at: r.deletedAt,
        })),
      },
    };
  }
}
