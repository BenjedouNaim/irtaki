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
import { ListOwnDailyReportsQueryDto } from './list-own-daily-reports-query.dto';
import { ListOwnDailyReportsResponseDto } from './list-own-daily-reports-response.dto';

/**
 * F-DR-05 / API-031 `GET /daily-reports?from=&to=` — a Student browses
 * their own daily report history (FR-DR-10), `report_date DESC`
 * (APIS §9.4), cursor-paginated with `limit` default 20 / max 100
 * (APIS §9.2). Scope is "own": the Reports module's own repository joins
 * the caller's Active membership inside the one query (TS §15.2, SA §11 —
 * Reports calls into no other module). A Student without an Active
 * membership simply has no history — an empty page, not an error.
 */
@Injectable()
export class ListOwnDailyReportsUseCase {
  constructor(
    @Inject(DAILY_REPORT_REPOSITORY)
    private readonly dailyReportRepository: IDailyReportRepository,
  ) {}

  async execute(
    userId: string,
    query: ListOwnDailyReportsQueryDto,
  ): Promise<ListOwnDailyReportsResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseDailyReportsCursor(query.cursor);

    const { rows, hasMore } =
      await this.dailyReportRepository.findOwnHistoryByUserId({
        userId,
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
