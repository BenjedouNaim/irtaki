import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  GroupMemberRecord,
  GroupPerformanceContextRecord,
  IGroupPerformanceRepository,
  MemberAttendedWeek,
  MemberDaySnapshot,
} from '../domain/group-performance.repository.interface';

interface RawContextRow {
  recitation_day: number | string;
  archived_at: string | Date | null;
  caller_timezone: string;
}

interface RawMemberRow {
  id: string;
  state: 'Active' | 'Terminated';
  started_at: string;
  ended_at: string | null;
  full_name: string | null;
  timezone: string;
}

interface RawMemberDaySnapshotRow {
  membership_id: string;
  report_date: string;
  type: 'Normal' | 'Absent' | 'Revision';
  absence_reason: 'Sick' | 'Studying' | 'Other' | null;
  no_memorization_today: boolean | null;
  no_revision_today: boolean | null;
  has_memo_range: boolean;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
}

interface RawAttendedWeekRow {
  membership_id: string;
  week_start: string;
}

/**
 * The member-set projection shared by both FR-PERF-09/10 branches. Kept as
 * one literal fragment used inside two complete, literal statements — never
 * concatenated with anything caller-supplied (TS §36).
 */
function toMemberRecord(row: RawMemberRow): GroupMemberRecord {
  return {
    membershipId: row.id,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    fullName: row.full_name,
    timezone: row.timezone,
  };
}

/**
 * API-038's reads, owned by the Performance module (APIS §12 UC-07:
 * "reads `memberships`, `daily_reports`, `weekly_reports`"). Every
 * statement is literal and parameterised (TS §36), index-backed (DBD §23)
 * and auto-committing — no transaction, no locking, no elevated isolation
 * (TS §19, §20).
 */
@Injectable()
export class GroupPerformanceRepository implements IGroupPerformanceRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findContext(
    groupId: string,
    callerId: string,
  ): Promise<GroupPerformanceContextRecord | null> {
    // Two primary-key lookups in one statement: the group's week anchor and
    // archival bound, and the caller's own timezone (T-01). Zero rows means
    // the group does not exist — the Admin path's 404 (APIS §9.6).
    const rows = await this.dataSource.query<RawContextRow[]>(
      `SELECT g.recitation_day,
              g.archived_at,
              u.timezone AS caller_timezone
         FROM groups g
         JOIN users u ON u.id = $2::uuid
        WHERE g.id = $1::uuid
        LIMIT 1`,
      [groupId, callerId],
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    const row = rows[0];
    return {
      recitationDay: Number(row.recitation_day),
      archivedAt:
        row.archived_at === null
          ? null
          : new Date(row.archived_at).toISOString(),
      callerTimezone: row.caller_timezone,
    };
  }

  async findActiveMembers(groupId: string): Promise<GroupMemberRecord[]> {
    // FR-PERF-10: the current-week view sees Active memberships only.
    // One DB-IDX-03 (group_id, state) scan.
    const rows = await this.dataSource.query<RawMemberRow[]>(
      `SELECT m.id,
              m.state,
              m.started_at::text AS started_at,
              m.ended_at::text   AS ended_at,
              u.full_name,
              u.timezone
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1
          AND m.state = 'Active'
        ORDER BY m.id ASC`,
      [groupId],
    );
    return rows.map(toMemberRecord);
  }

  async findMembersIntersecting(
    groupId: string,
    from: string,
    to: string,
  ): Promise<GroupMemberRecord[]> {
    // FR-PERF-09: Active AND Terminated memberships whose active window
    // [started_at, ended_at ?? ∞] intersects [from, to]. One DB-IDX-04
    // (group_id, started_at, ended_at) scan — DBD §26's "period-aware
    // historical aggregation" access path.
    const rows = await this.dataSource.query<RawMemberRow[]>(
      `SELECT m.id,
              m.state,
              m.started_at::text AS started_at,
              m.ended_at::text   AS ended_at,
              u.full_name,
              u.timezone
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.group_id = $1
          AND m.started_at <= $3::date
          AND (m.ended_at IS NULL OR m.ended_at >= $2::date)
        ORDER BY m.id ASC`,
      [groupId, from, to],
    );
    return rows.map(toMemberRecord);
  }

  async findDaySnapshots(
    membershipIds: readonly string[],
    from: string,
    to: string,
  ): Promise<MemberDaySnapshot[]> {
    if (membershipIds.length === 0) {
      return [];
    }
    // One DB-IDX-01 (membership_id, report_date) walk per membership inside
    // a single statement. Only the VO-09 classification inputs are
    // projected; the memorisation range is reduced to its presence so no
    // ordinal leaves the query.
    const rows = await this.dataSource.query<RawMemberDaySnapshotRow[]>(
      `SELECT r.membership_id,
              r.report_date::text AS report_date,
              r.type,
              r.absence_reason,
              r.no_memorization_today,
              r.no_revision_today,
              (r.memo_from_ordinal IS NOT NULL) AS has_memo_range,
              r.completed_50_repetitions,
              r.repetitions_in_single_session
         FROM daily_reports r
        WHERE r.membership_id = ANY($1::uuid[])
          AND r.report_date >= $2::date
          AND r.report_date <= $3::date
          AND r.deleted_at IS NULL
        ORDER BY r.membership_id ASC, r.report_date ASC`,
      [membershipIds, from, to],
    );

    return rows.map((row) => ({
      membershipId: row.membership_id,
      reportDate: row.report_date,
      type: row.type,
      absenceReason: row.absence_reason ?? null,
      noMemorizationToday: row.no_memorization_today ?? null,
      noRevisionToday: row.no_revision_today ?? null,
      hasMemoRange: row.has_memo_range,
      completed50Repetitions: row.completed_50_repetitions ?? null,
      repetitionsInSingleSession: row.repetitions_in_single_session ?? null,
    }));
  }

  async findAttendedWeeks(
    membershipIds: readonly string[],
    fromWeekStart: string,
    toWeekStart: string,
  ): Promise<MemberAttendedWeek[]> {
    if (membershipIds.length === 0) {
      return [];
    }
    // One DB-IDX-02 (membership_id, week_start) range scan. Only `Finalised`
    // rows count: an `Open` row carries no confirmed answer yet (ST-06,
    // FR-WR-06).
    const rows = await this.dataSource.query<RawAttendedWeekRow[]>(
      `SELECT w.membership_id,
              w.week_start::text AS week_start
         FROM weekly_reports w
        WHERE w.membership_id = ANY($1::uuid[])
          AND w.week_start >= $2::date
          AND w.week_start <= $3::date
          AND w.state = 'Finalised'
          AND w.attended_recitation_call = true
          AND w.deleted_at IS NULL`,
      [membershipIds, fromWeekStart, toWeekStart],
    );

    return rows.map((row) => ({
      membershipId: row.membership_id,
      weekStart: row.week_start,
    }));
  }
}
