import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IMembershipReportScope } from '../domain/membership-report-scope.interface';

/**
 * TS §15.2 worked example for `GET /memberships/{id}/daily-reports`:
 *
 *   SELECT 1 FROM memberships m JOIN groups g ON g.id = m.group_id
 *    WHERE m.id = :membershipId AND g.teacher_id = :T
 *
 * One literal, parameterised statement (TS §36) on the memberships primary
 * key; `m.state = 'Active'` keeps a Terminated membership out of a Teacher's
 * scope (its records are the Admin recovery view's, UC-16). No cache, no
 * cross-module call (SA §14 / DEC-C11).
 */
@Injectable()
export class MembershipReportScope implements IMembershipReportScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isActiveMembershipOfTeacher(
    membershipId: string,
    teacherId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
        WHERE m.id = $1
          AND g.teacher_id = $2
          AND m.state = 'Active'
        LIMIT 1`,
      [membershipId, teacherId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async membershipExists(membershipId: string): Promise<boolean> {
    // Primary-key lookup, any state (a Terminated membership still exists —
    // APIS §10.6 accepts either state on the recovery route, APIQ-NEW-10).
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM memberships m
        WHERE m.id = $1
        LIMIT 1`,
      [membershipId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
