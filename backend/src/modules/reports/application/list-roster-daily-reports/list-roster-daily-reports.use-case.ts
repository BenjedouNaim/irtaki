import { Inject, Injectable } from '@nestjs/common';
import {
  clampLimit,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  DAILY_REPORT_REPOSITORY,
  type IDailyReportRepository,
  DailyReportsCursor,
} from '../../domain/daily-report.repository.interface';
import { toDailyReportDto } from '../daily-report.mapper';
import { parseDailyReportsCursor } from '../daily-reports-cursor';
import { ListRosterDailyReportsQueryDto } from './list-roster-daily-reports-query.dto';
import { ListRosterDailyReportsResponseDto } from './list-roster-daily-reports-response.dto';

/**
 * F-DR-06 / API-032 `GET /memberships/{id}/daily-reports?from=&to=` —
 * a Teacher (assigned group) or the Admin (all) reads one student's raw
 * daily report list, `report_date DESC` (APIS §9.4), cursor-paginated with
 * `limit` default 20 / max 100 (APIS §9.2) — the same page as API-031.
 *
 * Authorization happened upstream (SA §14 order): RolesGuard — Assistant is
 * absent from `@Roles()` (DEC-B09) — then `MembershipDailyReportsScopeGuard`
 * resolved the Teacher's scope with one indexed lookup (TS §15.2). The id
 * this use case receives is therefore the one that already passed the
 * guard; the repository binds its query to exactly that id and derives
 * nothing else (TS §15.2 step 4). A membership with no live reports is an
 * empty page, not an error.
 */
@Injectable()
export class ListRosterDailyReportsUseCase {
  constructor(
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    membershipId: string,
    query: ListRosterDailyReportsQueryDto,
  ): Promise<ListRosterDailyReportsResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseDailyReportsCursor(query.cursor);

    const { rows, hasMore } =
      await this.dailyReportRepository.findHistoryByMembershipId({
        membershipId,
        from: query.from ?? null,
        to: query.to ?? null,
        limit,
        cursor,
      });

    const last = rows[rows.length - 1];
    const next_cursor =
      hasMore && last
        ? encodeCursor<DailyReportsCursor['sortKey']>({
            id: last.id,
            sortKey: { reportDate: last.reportDate },
          })
        : null;

    return {
      data: rows.map(toDailyReportDto),
      pagination: { next_cursor, has_more: hasMore },
    };
  }
}
