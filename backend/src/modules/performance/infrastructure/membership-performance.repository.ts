import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  IMembershipPerformanceRepository,
  MembershipPerformanceContextRecord,
} from '../domain/membership-performance.repository.interface';

interface RawMembershipContextRow {
  membership_id: string;
  recitation_day: number | string;
  archived_at: string | null;
  started_at: string;
  ended_at: string | null;
  timezone: string;
}

/**
 * API-039's context read: the membership's window, its group's week anchor
 * and archival bound, and the STUDENT's own timezone — the day-boundary
 * authority for a single-student view (T-01, INV-27, DEC-B03).
 *
 * One literal, parameterised statement (TS §36) on the `memberships`
 * primary key, joined to `groups` and `users` by their own primary keys.
 * The membership id is the one the route-specific ScopeGuard already
 * verified (TS §15.2 step 4 — "never a second, independently-trusted ID"),
 * so no scope predicate is repeated here; the query is bound to exactly
 * that id, which is SA §14's NFR-19 backstop.
 */
@Injectable()
export class MembershipPerformanceRepository implements IMembershipPerformanceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findContext(
    membershipId: string,
  ): Promise<MembershipPerformanceContextRecord | null> {
    const rows = await this.dataSource.query<RawMembershipContextRow[]>(
      `SELECT m.id                AS membership_id,
              g.recitation_day,
              g.archived_at::text AS archived_at,
              m.started_at::text  AS started_at,
              m.ended_at::text    AS ended_at,
              u.timezone
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users  u ON u.id = m.user_id
        WHERE m.id = $1::uuid
        LIMIT 1`,
      [membershipId],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      membershipId: row.membership_id,
      recitationDay: Number(row.recitation_day),
      archivedAt: row.archived_at
        ? new Date(row.archived_at).toISOString()
        : null,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      timezone: row.timezone,
    };
  }
}
