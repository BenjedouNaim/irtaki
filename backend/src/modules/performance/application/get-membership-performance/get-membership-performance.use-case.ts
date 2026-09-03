import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
} from '../../../reports/domain/daily-report.repository.interface';
import {
  type IWeeklyReportRepository,
  WEEKLY_REPORT_REPOSITORY,
} from '../../../reports/domain/weekly-report.repository.interface';
import {
  type IMembershipPerformanceRepository,
  MEMBERSHIP_PERFORMANCE_REPOSITORY,
} from '../../domain/membership-performance.repository.interface';
import { computeMembershipPerformance } from '../performance-computation';
import { GetMembershipPerformanceQueryDto } from './get-membership-performance-query.dto';
import { GetMembershipPerformanceResponseDto } from './membership-performance-response.dto';

/**
 * F-PERF-03 / API-039 `GET /memberships/{id}/performance?period=` — a
 * Teacher (assigned group), the Admin (all) or the Student themself reads
 * ONE student's dashboard (UC-08 `ComputeStudentPerformance`, APIS §12).
 *
 * The response is API-037's verbatim (APIS §10.9 "same shape as
 * `/me/performance`"): the same DS-03 composition,
 * `computeMembershipPerformance`, over the same three membership-scoped
 * reads — only the way the membership is named differs. Every figure is
 * still measured in the STUDENT's own timezone (T-01, INV-27), never the
 * reading Teacher's, so the same student's numbers cannot change with who
 * is looking.
 *
 * Scope is settled upstream by `MembershipPerformanceScopeGuard` (TS §15.2,
 * SA §14) — the membership id reaching this method has already been
 * verified, and is used verbatim (TS §15.2 step 4). The Assistant never
 * arrives: they are absent from `@Roles()` (DEC-B09). The only failure this
 * use case owns is the Admin's `404` for an id that names no membership,
 * since the Admin bypasses the guard (DEC-C07).
 *
 * Nothing is stored — Performance owns no table (DBD §68, TS §24).
 */
@Injectable()
export class GetMembershipPerformanceUseCase {
  constructor(
    @Inject(MEMBERSHIP_PERFORMANCE_REPOSITORY)
    private readonly membershipPerformanceRepository: IMembershipPerformanceRepository,
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    membershipId: string,
    query: GetMembershipPerformanceQueryDto,
    now: Date = new Date(),
  ): Promise<GetMembershipPerformanceResponseDto> {
    const context =
      await this.membershipPerformanceRepository.findContext(membershipId);
    if (!context) {
      // Reachable on the Admin path alone: a Teacher's or a Student's
      // unknown id was already masked as 403 by the guard (NFR-20).
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
