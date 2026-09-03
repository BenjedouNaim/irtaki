import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IWeeklyReportScope } from '../domain/weekly-report-scope.interface';

/**
 * TS §15.2 / SA §14 own-scope lookup for `POST /weekly-reports/{id}/confirm`:
 *
 *   SELECT 1 FROM weekly_reports w JOIN memberships m ON m.id = w.membership_id
 *    WHERE w.id = :id AND m.user_id = :caller AND w.deleted_at IS NULL
 *
 * One literal, parameterised statement (TS §36) on the weekly_reports
 * primary key. No cache, no cross-module call (SA §14 / DEC-C11).
 */
@Injectable()
export class WeeklyReportScope implements IWeeklyReportScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isOwnedByStudent(reportId: string, userId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM weekly_reports w
         JOIN memberships m ON m.id = w.membership_id
        WHERE w.id = $1
          AND m.user_id = $2
          AND w.deleted_at IS NULL
        LIMIT 1`,
      [reportId, userId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
