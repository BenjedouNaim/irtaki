import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../../reports/domain/daily-report.repository.interface';
import {
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
} from '../../../reports/domain/weekly-report.repository.interface';
import { computeMembershipPerformance } from '../performance-computation';
import { GetOwnPerformanceQueryDto } from './get-own-performance-query.dto';
import { GetOwnPerformanceResponseDto } from './performance-response.dto';

/**
 * F-PERF-01 / API-037 `GET /me/performance?period=` — a Student reads their
 * own commitment score and performance breakdown over a selectable period
 * (FR-PERF-05, UC-02).
 *
 * Scope: own Active membership, resolved by ONE indexed lookup inside the
 * Reports module's own repository (TS §15.2). Performance owns no table and
 * is a pure derivation over Reports/Memberships/Progress reads (SA §11,
 * TS §11) — it reuses API-033's context query rather than opening a second
 * path to `memberships`. A Student with no Active membership gets
 * `404 NOT_FOUND`, mirroring API-033 and API-041.
 *
 * The calculation itself is `computeMembershipPerformance` — the one DS-03
 * composition this endpoint shares with API-039 (F-PERF-03), which differs
 * only in how the membership is named. Nothing is stored: every figure is
 * recomputed on each call (DEC-A10, TS §24).
 */
@Injectable()
export class GetOwnPerformanceUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    userId: string,
    query: GetOwnPerformanceQueryDto,
    now: Date = new Date(),
  ): Promise<GetOwnPerformanceResponseDto> {
    const context =
      await this.weeklyReportRepository.findCurrentWeekContextByUserId(userId);
    if (!context) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    return {
      data: await computeMembershipPerformance(
        {
          membershipId: context.membershipId,
          recitationDay: context.recitationDay,
          archivedAt: context.archivedAt,
          startedAt: context.startedAt,
          endedAt: context.endedAt,
          timezone: context.timezone,
        },
        {
          weeklyReportRepository: this.weeklyReportRepository,
          dailyReportRepository: this.dailyReportRepository,
        },
        query,
        now,
      ),
    };
  }
}
