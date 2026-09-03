import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  clampLimit,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  WEEKLY_REPORT_REPOSITORY,
  type IWeeklyReportRepository,
  WeeklyReportsCursor,
} from '../../domain/weekly-report.repository.interface';
import {
  MEMBERSHIP_REPORT_SCOPE,
  type IMembershipReportScope,
} from '../../domain/membership-report-scope.interface';
import { toWeeklyReportDto } from '../weekly-report.mapper';
import { parseWeeklyReportsCursor } from '../weekly-reports-cursor';
import { ListRosterWeeklyReportsQueryDto } from './list-roster-weekly-reports-query.dto';
import { ListRosterWeeklyReportsResponseDto } from './list-roster-weekly-reports-response.dto';

/**
 * F-WR-04 / API-036 `GET /memberships/{id}/weekly-reports` — a Teacher
 * (assigned group) or the Admin (all) reads one student's finalised weekly
 * history, `week_start DESC` (APIS §9.4), cursor-paginated with `limit`
 * default 20 / max 100 (APIS §9.2) — the same page as API-035.
 *
 * Authorization happened upstream (SA §14 order): RolesGuard — Assistant is
 * absent from `@Roles()` (DEC-B09) — then `MembershipWeeklyReportsScopeGuard`
 * resolved the Teacher's scope with one indexed lookup (TS §15.2). The id
 * this use case receives is therefore the one that already passed the
 * guard; the repository binds its query to exactly that id and derives
 * nothing else (TS §15.2 step 4).
 *
 * A membership with no finalised weeks is an empty page, not an error. A
 * membership that does not exist at all is `404 NOT_FOUND` (APIS §9.6,
 * APIQ-NEW-09) — reachable only by the Admin, who bypasses the ScopeGuard
 * (DEC-C07); a Teacher's non-existent id is already the uniform 403
 * upstream. Same answer as API-032's use case. A non-empty page proves
 * existence by itself (DB-FK-06), so the extra primary-key lookup runs
 * only when the page comes back empty.
 */
@Injectable()
export class ListRosterWeeklyReportsUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
    @Inject(MEMBERSHIP_REPORT_SCOPE)
    private readonly membershipReportScope: IMembershipReportScope,
  ) {}

  async execute(
    membershipId: string,
    query: ListRosterWeeklyReportsQueryDto,
  ): Promise<ListRosterWeeklyReportsResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseWeeklyReportsCursor(query.cursor);

    const { rows, hasMore } =
      await this.weeklyReportRepository.findHistoryByMembershipId({
        membershipId,
        from: query.from ?? null,
        to: query.to ?? null,
        limit,
        cursor,
      });

    if (
      rows.length === 0 &&
      !(await this.membershipReportScope.membershipExists(membershipId))
    ) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const last = rows[rows.length - 1];
    const next_cursor =
      hasMore && last
        ? encodeCursor<WeeklyReportsCursor['sortKey']>({
            id: last.id,
            sortKey: { weekStart: last.weekStart },
          })
        : null;

    return {
      data: rows.map(toWeeklyReportDto),
      pagination: { next_cursor, has_more: hasMore },
    };
  }
}
