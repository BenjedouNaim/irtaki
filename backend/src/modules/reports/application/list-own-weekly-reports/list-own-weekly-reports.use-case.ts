import { Inject, Injectable } from '@nestjs/common';
import {
  clampLimit,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import {
  WEEKLY_REPORT_REPOSITORY,
  type IWeeklyReportRepository,
  WeeklyReportsCursor,
} from '../../domain/weekly-report.repository.interface';
import { toWeeklyReportDto } from '../weekly-report.mapper';
import { parseWeeklyReportsCursor } from '../weekly-reports-cursor';
import { ListOwnWeeklyReportsQueryDto } from './list-own-weekly-reports-query.dto';
import { ListOwnWeeklyReportsResponseDto } from './list-own-weekly-reports-response.dto';

/**
 * F-WR-03 / API-035 `GET /weekly-reports?from=&to=` — a Student browses
 * their own weekly report history, `week_start DESC` (APIS §9.4),
 * cursor-paginated with `limit` default 20 / max 100 (APIS §9.2). Scope
 * is "own": the Reports module's own repository joins the caller's Active
 * membership inside the one query (TS §15.2, SA §11 — Reports calls into
 * no other module). A Student without an Active membership simply has no
 * history — an empty page, not an error — exactly as API-031.
 */
@Injectable()
export class ListOwnWeeklyReportsUseCase {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepository: IWeeklyReportRepository,
  ) {}

  async execute(
    userId: string,
    query: ListOwnWeeklyReportsQueryDto,
  ): Promise<ListOwnWeeklyReportsResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseWeeklyReportsCursor(query.cursor);

    const { rows, hasMore } =
      await this.weeklyReportRepository.findOwnHistoryByUserId({
        userId,
        from: query.from ?? null,
        to: query.to ?? null,
        limit,
        cursor,
      });

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
