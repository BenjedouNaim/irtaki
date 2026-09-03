import { Inject, Injectable } from '@nestjs/common';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../domain/daily-report.repository.interface';
import {
  DailyReportBlockReason,
  evaluateDailyReportEligibility,
} from '../../domain/daily-report-eligibility';
import { isoDayOfWeek, localDateInTimezone } from '../../domain/local-date';
import { toDailyReportDto } from '../daily-report.mapper';
import { TodayReportStatusResponseDto } from './today-report-status-response.dto';

/**
 * F-DR-01 / API-029 `GET /daily-reports/today` — a Student learns whether
 * they can submit today's report and, if not, exactly why (SAS §23 API-05:
 * the client must never infer the reason).
 *
 * Scope: own Active membership, resolved by the Reports module's own
 * repository in one indexed lookup (TS §15.2; SA §11: Reports calls into no
 * other module). "Today" is the calendar date in the student's persisted
 * `User.timezone` (VR-10, T-01, INV-27). The existing-report lookup only
 * runs once the structural preconditions (VR-35, VR-12) hold.
 */
@Injectable()
export class GetTodayReportStatusUseCase {
  constructor(
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    userId: string,
    now: Date = new Date(),
  ): Promise<TodayReportStatusResponseDto> {
    const context =
      await this.dailyReportRepository.findTodayContextByUserId(userId);

    if (!context) {
      return blocked('membership_inactive');
    }

    const today = localDateInTimezone(now, context.timezone);
    const todayIsoDay = isoDayOfWeek(today);

    // Membership is Active by construction of the scope query (VR-35).
    const structural = evaluateDailyReportEligibility({
      membershipActive: true,
      groupLifecycleState: context.groupLifecycleState,
      recitationDay: context.recitationDay,
      todayIsoDay,
      hasReportForToday: false,
    });
    if (!structural.canSubmit) {
      return blocked(structural.blockReason);
    }

    const existing = await this.dailyReportRepository.findByMembershipAndDate(
      context.membershipId,
      today,
    );

    const eligibility = evaluateDailyReportEligibility({
      membershipActive: true,
      groupLifecycleState: context.groupLifecycleState,
      recitationDay: context.recitationDay,
      todayIsoDay,
      hasReportForToday: existing !== null,
    });

    if (!eligibility.canSubmit) {
      return {
        data: {
          can_submit: false,
          block_reason: eligibility.blockReason,
          ...(existing ? { existing_report: toDailyReportDto(existing) } : {}),
        },
      };
    }

    return { data: { can_submit: true } };
  }
}

function blocked(
  blockReason: DailyReportBlockReason,
): TodayReportStatusResponseDto {
  return { data: { can_submit: false, block_reason: blockReason } };
}
