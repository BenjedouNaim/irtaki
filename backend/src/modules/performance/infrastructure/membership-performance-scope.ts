import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IMembershipPerformanceScope } from '../domain/membership-performance-scope.interface';

/**
 * TS §15.2's own resolution for `GET /memberships/{id}/performance`:
 *
 *   SELECT 1 FROM memberships m JOIN groups g ON g.id = m.group_id
 *    WHERE m.id = :membershipId AND g.teacher_id = :T
 *
 * plus the Student's own-scope variant, which needs no join at all.
 *
 * Both are one literal, parameterised statement (TS §36) on the
 * `memberships` primary key. `m.state = 'Active'` keeps a Terminated
 * membership out of every caller's scope: its records belong to the Admin
 * recovery view (UC-16), and the Admin reaches this route by bypassing the
 * guard entirely (DEC-C07).
 *
 * `g.assistant_id` is deliberately absent from the staff predicate —
 * DEC-B09 keeps the Assistant off every performance route unconditionally,
 * so an Assistant who staffs the group must still be denied. RolesGuard
 * rejects them first (they are absent from `@Roles()`); this omission is
 * the second half of that guarantee (NFR-19 defence in depth).
 *
 * No cache (DEC-C11), no cross-module call (SA §14).
 */
@Injectable()
export class MembershipPerformanceScope implements IMembershipPerformanceScope {
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

  async isOwnActiveMembership(
    membershipId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM memberships m
        WHERE m.id = $1
          AND m.user_id = $2
          AND m.state = 'Active'
        LIMIT 1`,
      [membershipId, userId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
