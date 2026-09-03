import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  CurrentWeekContextRecord,
  FindMembershipWeeklyReportsParams,
  FindOwnWeeklyReportsParams,
  IWeeklyReportRepository,
  NewWeeklyReport,
  WeeklyReportPage,
  WeeklyReportRecord,
  WeeklyReportsPageParams,
  WeeklyReportState,
  WeeklyReportWithTimezoneRecord,
} from '../domain/weekly-report.repository.interface';
import { WeeklyReportTypeOrmEntity } from './weekly-report.typeorm-entity';

interface RawCurrentWeekContextRow {
  membership_id: string;
  group_id: string;
  lifecycle_state: string;
  recitation_day: number | string;
  archived_at: string | null;
  started_at: string;
  ended_at: string | null;
  timezone: string;
}

interface RawWeeklyReportRow {
  id: string;
  membership_id: string;
  week_start: string;
  week_end: string;
  expected_days: number | string;
  missed_daily_reports: number | string;
  missed_daily_memorization: number | string;
  missed_daily_revision: number | string;
  missed_50_repetitions: number | string;
  missed_single_session: number | string;
  attended_recitation_call: boolean;
  state: WeeklyReportState;
  finalised_at: string | null;
  finalised_by: string | null;
}

interface RawWeeklyReportWithTimezoneRow extends RawWeeklyReportRow {
  timezone: string;
}

/**
 * The projection every weekly-report read shares. Dates travel as text so
 * the driver never re-interprets a DATE through the server timezone
 * (T-04); instants are cast to text and re-serialised as ISO-8601.
 * Literal SQL — no caller input is ever interpolated (TS §36).
 */
const WEEKLY_REPORT_COLUMNS = `w.id,
              w.membership_id,
              w.week_start::text   AS week_start,
              w.week_end::text     AS week_end,
              w.expected_days,
              w.missed_daily_reports,
              w.missed_daily_memorization,
              w.missed_daily_revision,
              w.missed_50_repetitions,
              w.missed_single_session,
              w.attended_recitation_call,
              w.state,
              w.finalised_at::text AS finalised_at,
              w.finalised_by`;

function toRecord(row: RawWeeklyReportRow): WeeklyReportRecord {
  return {
    id: row.id,
    membershipId: row.membership_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    expectedDays: Number(row.expected_days),
    missedDailyReports: Number(row.missed_daily_reports),
    missedDailyMemorization: Number(row.missed_daily_memorization),
    missedDailyRevision: Number(row.missed_daily_revision),
    missed50Repetitions: Number(row.missed_50_repetitions),
    missedSingleSession: Number(row.missed_single_session),
    attendedRecitationCall: row.attended_recitation_call,
    state: row.state,
    finalisedAt: row.finalised_at
      ? new Date(row.finalised_at).toISOString()
      : null,
    finalisedBy: row.finalised_by ?? null,
  };
}

/**
 * TypeORM's Postgres driver hands an `UPDATE … RETURNING` back as
 * `[rows, affectedCount]` (unlike `INSERT … RETURNING`, which yields the
 * rows directly). Normalises either shape to the returned rows.
 */
function returnedRows<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  if (raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
    return raw[0] as T[];
  }
  return raw as T[];
}

function toRecordWithTimezone(
  row: RawWeeklyReportWithTimezoneRow,
): WeeklyReportWithTimezoneRecord {
  return { ...toRecord(row), timezone: row.timezone };
}

/**
 * The optional `from`/`to` bounds (APIS §9.3) and the keyset position
 * (APIS §9.2) of both weekly history lists, expressed as nullable
 * parameters so each statement stays ONE literal, parameterised query
 * (TS §36). `id` is the tie-breaker of the cursor shape shared with the
 * daily lists; DB-UQ-05 already makes `(membership_id, week_start)` unique.
 */
const HISTORY_PAGE_PREDICATE = `AND ($2::date IS NULL OR w.week_start >= $2::date)
          AND ($3::date IS NULL OR w.week_start <= $3::date)
          AND ($4::date IS NULL
               OR w.week_start < $4::date
               OR (w.week_start = $4::date AND w.id < $5::uuid))`;

function pageParameters(
  params: WeeklyReportsPageParams,
): [string | null, string | null, string | null, string | null, number] {
  return [
    params.from,
    params.to,
    params.cursor?.sortKey.weekStart ?? null,
    params.cursor?.id ?? null,
    params.limit + 1,
  ];
}

function toPage(rows: RawWeeklyReportRow[], limit: number): WeeklyReportPage {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page.map(toRecord), hasMore };
}

@Injectable()
export class WeeklyReportRepository implements IWeeklyReportRepository {
  constructor(
    @InjectRepository(WeeklyReportTypeOrmEntity)
    private readonly weeklyReportRepo: Repository<WeeklyReportTypeOrmEntity>,
  ) {}

  async findCurrentWeekContextByUserId(
    userId: string,
  ): Promise<CurrentWeekContextRecord | null> {
    // One indexed lookup (DB-UQ-02 partial index on Active memberships),
    // scope applied in the WHERE clause (TS §15.2, SA §14 NFR-19 backstop).
    // The same join as API-029's context, plus the three EffectiveWindow
    // bounds (SAS §18.1) read from the owning tables.
    const rows = await this.weeklyReportRepo.manager.query<
      RawCurrentWeekContextRow[]
    >(
      `SELECT m.id                 AS membership_id,
              g.id                 AS group_id,
              g.lifecycle_state,
              g.recitation_day,
              g.archived_at::text  AS archived_at,
              m.started_at::text   AS started_at,
              m.ended_at::text     AS ended_at,
              u.timezone
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users  u ON u.id = m.user_id
        WHERE m.user_id = $1
          AND m.state = 'Active'
        LIMIT 1`,
      [userId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      membershipId: row.membership_id,
      groupId: row.group_id,
      groupLifecycleState: row.lifecycle_state,
      recitationDay: Number(row.recitation_day),
      archivedAt: row.archived_at
        ? new Date(row.archived_at).toISOString()
        : null,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      timezone: row.timezone,
    };
  }

  async findByMembershipAndWeekStart(
    membershipId: string,
    weekStart: string,
  ): Promise<WeeklyReportRecord | null> {
    // Hits DB-UQ-05 (membership_id, week_start) WHERE deleted_at IS NULL.
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportRow[]
    >(
      `SELECT ${WEEKLY_REPORT_COLUMNS}
         FROM weekly_reports w
        WHERE w.membership_id = $1
          AND w.week_start = $2::date
          AND w.deleted_at IS NULL
        LIMIT 1`,
      [membershipId, weekStart],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return toRecord(rows[0]);
  }

  async createIfAbsent(report: NewWeeklyReport): Promise<WeeklyReportRecord> {
    // One INSERT, auto-committed (TS §19). `ON CONFLICT … DO NOTHING` on the
    // DB-UQ-05 partial index lets a concurrent first read win without an
    // error (TS §20): whichever row exists afterwards is the week's row.
    // `attended_recitation_call` and `state` take their column defaults
    // (`false`, `'Open'` — FR-WR-06, ST-06).
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportRow[]
    >(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session
       ) VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (membership_id, week_start) WHERE deleted_at IS NULL
       DO NOTHING
       RETURNING ${WEEKLY_REPORT_COLUMNS.replace(/w\./g, '')}`,
      [
        uuidv7(),
        report.membershipId,
        report.weekStart,
        report.weekEnd,
        report.metrics.expectedDays,
        report.metrics.missedDailyReports,
        report.metrics.missedDailyMemorization,
        report.metrics.missedDailyRevision,
        report.metrics.missed50Repetitions,
        report.metrics.missedSingleSession,
      ],
    );

    if (rows && rows.length > 0) {
      return toRecord(rows[0]);
    }

    const existing = await this.findByMembershipAndWeekStart(
      report.membershipId,
      report.weekStart,
    );
    if (!existing) {
      // Unreachable while DB-UQ-05 holds: DO NOTHING fired, so a live row
      // for this key exists. Surfaced as a 500 by the global filter.
      throw new Error(
        'weekly_reports insert conflicted but no live row was found',
      );
    }
    return existing;
  }

  async findOwnById(
    reportId: string,
    userId: string,
  ): Promise<WeeklyReportWithTimezoneRecord | null> {
    // Primary-key lookup with the own-scope predicate IN the query (TS
    // §15.2, NFR-19): zero rows for another student's report, a missing id
    // and a soft-deleted row alike (NFR-20). `users.timezone` rides along
    // for the VR-21 evaluation (T-01).
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportWithTimezoneRow[]
    >(
      `SELECT ${WEEKLY_REPORT_COLUMNS},
              u.timezone
         FROM weekly_reports w
         JOIN memberships m ON m.id = w.membership_id
         JOIN users       u ON u.id = m.user_id
        WHERE w.id = $1
          AND m.user_id = $2
          AND w.deleted_at IS NULL
        LIMIT 1`,
      [reportId, userId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return toRecordWithTimezone(rows[0]);
  }

  async finaliseByStudent(input: {
    reportId: string;
    attendedRecitationCall: boolean;
    finalisedBy: string;
    finalisedAt: Date;
  }): Promise<WeeklyReportRecord | null> {
    // One auto-committed UPDATE (TS §19 "single update, state transition"),
    // guarded by `state = 'Open'` (TS §20): under READ COMMITTED a
    // concurrent finalisation — a double tap, or the scheduler — leaves
    // this statement with zero rows, which the use case answers as
    // `409 ALREADY_FINALISED` (VR-36). DB-CHK-08 stays the backstop.
    const raw: unknown = await this.weeklyReportRepo.manager.query(
      `UPDATE weekly_reports w
          SET attended_recitation_call = $2,
              state                    = 'Finalised',
              finalised_at             = $3::timestamptz,
              finalised_by             = $4
        WHERE w.id = $1
          AND w.state = 'Open'
          AND w.deleted_at IS NULL
       RETURNING ${WEEKLY_REPORT_COLUMNS}`,
      [
        input.reportId,
        input.attendedRecitationCall,
        input.finalisedAt.toISOString(),
        input.finalisedBy,
      ],
    );
    const rows = returnedRows<RawWeeklyReportRow>(raw);

    if (rows.length === 0) {
      return null;
    }

    return toRecord(rows[0]);
  }

  async countAttendedFinalisedWeeks(
    membershipId: string,
    fromWeekStart: string,
    toWeekStart: string,
  ): Promise<number> {
    // One DB-IDX-02 (membership_id, week_start) range scan — the index DBD
    // §26 names for AttendanceRate. Only `Finalised` rows count: an `Open`
    // row carries no confirmed answer yet (ST-06, FR-WR-06).
    const rows = await this.weeklyReportRepo.manager.query<
      Array<{ attended: string | number }>
    >(
      `SELECT count(*) AS attended
         FROM weekly_reports w
        WHERE w.membership_id = $1
          AND w.week_start >= $2::date
          AND w.week_start <= $3::date
          AND w.state = 'Finalised'
          AND w.attended_recitation_call = true
          AND w.deleted_at IS NULL`,
      [membershipId, fromWeekStart, toWeekStart],
    );

    return rows && rows.length > 0 ? Number(rows[0].attended) : 0;
  }

  async findAllOpenWithTimezone(): Promise<WeeklyReportWithTimezoneRecord[]> {
    // Bounded candidate set (DBQ-01: a row exists only from the recitation
    // day on). Literal, parameter-free statement (TS §36).
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportWithTimezoneRow[]
    >(
      `SELECT ${WEEKLY_REPORT_COLUMNS},
              u.timezone
         FROM weekly_reports w
         JOIN memberships m ON m.id = w.membership_id
         JOIN users       u ON u.id = m.user_id
        WHERE w.state = 'Open'
          AND w.deleted_at IS NULL
        ORDER BY w.week_end ASC, w.id ASC`,
    );

    return (rows ?? []).map(toRecordWithTimezone);
  }

  async finaliseAsScheduler(
    reportIds: readonly string[],
    finalisedAt: Date,
  ): Promise<WeeklyReportRecord[]> {
    if (reportIds.length === 0) {
      return [];
    }

    // One auto-committed UPDATE over the id set, guarded by `state = 'Open'`
    // so a confirmation that landed since the candidate read wins and a
    // second run rewrites nothing (VR-36, AR-17). `finalised_by` stays NULL
    // — the scheduler-default marker (DBD §14); `attended` is set to its
    // FR-WR-06 default explicitly.
    const raw: unknown = await this.weeklyReportRepo.manager.query(
      `UPDATE weekly_reports w
          SET attended_recitation_call = false,
              state                    = 'Finalised',
              finalised_at             = $2::timestamptz,
              finalised_by             = NULL
        WHERE w.id = ANY($1::uuid[])
          AND w.state = 'Open'
          AND w.deleted_at IS NULL
       RETURNING ${WEEKLY_REPORT_COLUMNS}`,
      [Array.from(reportIds), finalisedAt.toISOString()],
    );

    return returnedRows<RawWeeklyReportRow>(raw).map(toRecord);
  }

  async findOwnHistoryByUserId(
    params: FindOwnWeeklyReportsParams,
  ): Promise<WeeklyReportPage> {
    // Scope = the caller's Active membership, resolved by the join (DB-UQ-02
    // partial index on Active memberships). The row scan is a backward
    // range walk of DB-IDX-02 (membership_id, week_start), which serves
    // both the optional `from`/`to` bounds and the `week_start DESC` order
    // (APIS §9.4); `id DESC` is the keyset tie-breaker. Only `Finalised`
    // rows are history (UF §16 "appears in History" on finalisation, UF §34
    // "Finalised → read-only in History forever"); the Open recitation-day
    // row is served by API-033. `LIMIT limit + 1` derives `hasMore` without
    // a COUNT (APIS §9.1).
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportRow[]
    >(
      `SELECT ${WEEKLY_REPORT_COLUMNS}
         FROM memberships m
         JOIN weekly_reports w ON w.membership_id = m.id
        WHERE m.user_id = $1
          AND m.state = 'Active'
          AND w.deleted_at IS NULL
          AND w.state = 'Finalised'
          ${HISTORY_PAGE_PREDICATE}
        ORDER BY w.week_start DESC, w.id DESC
        LIMIT $6`,
      [params.userId, ...pageParameters(params)],
    );

    return toPage(rows ?? [], params.limit);
  }

  async findHistoryByMembershipId(
    params: FindMembershipWeeklyReportsParams,
  ): Promise<WeeklyReportPage> {
    // API-036: the membership id already passed the route-specific
    // ScopeGuard (TS §15.2 step 4), so the query binds to exactly that id
    // and re-derives nothing. Same DB-IDX-02 backward range walk, same
    // keyset cursor, same finalised-only rule and `limit + 1` page as the
    // own history above.
    const rows = await this.weeklyReportRepo.manager.query<
      RawWeeklyReportRow[]
    >(
      `SELECT ${WEEKLY_REPORT_COLUMNS}
         FROM weekly_reports w
        WHERE w.membership_id = $1
          AND w.deleted_at IS NULL
          AND w.state = 'Finalised'
          ${HISTORY_PAGE_PREDICATE}
        ORDER BY w.week_start DESC, w.id DESC
        LIMIT $6`,
      [params.membershipId, ...pageParameters(params)],
    );

    return toPage(rows ?? [], params.limit);
  }
}
