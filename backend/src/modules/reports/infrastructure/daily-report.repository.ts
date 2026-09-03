import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { DailyReport } from '../domain/daily-report.entity';
import {
  DailyReportAyahPositionRecord,
  DailyReportPage,
  DailyReportRecord,
  DailyReportsPageParams,
  FindMembershipDailyReportsParams,
  FindOwnDailyReportsParams,
  IDailyReportRepository,
  TodayReportContextRecord,
} from '../domain/daily-report.repository.interface';
import { DatedDailyReportSnapshot } from '../domain/weekly-metrics-calculator';
import { DailyReportTypeOrmEntity } from './daily-report.typeorm-entity';

interface RawTodayContextRow {
  membership_id: string;
  group_id: string;
  lifecycle_state: string;
  recitation_day: number | string;
  timezone: string;
}

interface RawDaySnapshotRow {
  report_date: string;
  type: 'Normal' | 'Absent' | 'Revision';
  absence_reason: 'Sick' | 'Studying' | 'Other' | null;
  no_memorization_today: boolean | null;
  no_revision_today: boolean | null;
  has_memo_range: boolean;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
}

interface RawDailyReportRow {
  id: string;
  membership_id: string;
  report_date: string;
  type: 'Normal' | 'Absent' | 'Revision';
  submitted_at: string;
  submitted_timezone: string;
  no_memorization_today: boolean | null;
  memo_from_surah: number | string | null;
  memo_from_ayah: number | string | null;
  memo_to_surah: number | string | null;
  memo_to_ayah: number | string | null;
  memo_time_from: string | null;
  memo_time_to: string | null;
  completed_50_repetitions: boolean | null;
  repetitions_in_single_session: boolean | null;
  no_revision_today: boolean | null;
  rev_from_surah: number | string | null;
  rev_from_ayah: number | string | null;
  rev_to_surah: number | string | null;
  rev_to_ayah: number | string | null;
  rev_time_from: string | null;
  rev_time_to: string | null;
  read_tafsir: boolean | null;
  absence_reason: 'Sick' | 'Studying' | 'Other' | null;
}

function toPosition(
  surah: number | string | null,
  ayah: number | string | null,
): DailyReportAyahPositionRecord | null {
  if (surah == null || ayah == null) {
    return null;
  }
  return { surah: Number(surah), ayah: Number(ayah) };
}

/** `TIME` columns come back as `HH:MM:SS`; the API speaks `HH:MM` (APIS §10.7). */
function toHourMinute(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 5);
}

/** One raw `daily_reports` row (ordinals already resolved) → record. */
function toRecord(row: RawDailyReportRow): DailyReportRecord {
  return {
    id: row.id,
    membershipId: row.membership_id,
    reportDate: row.report_date,
    type: row.type,
    submittedAt: new Date(row.submitted_at).toISOString(),
    submittedTimezone: row.submitted_timezone,
    noMemorizationToday: row.no_memorization_today ?? null,
    memoFrom: toPosition(row.memo_from_surah, row.memo_from_ayah),
    memoTo: toPosition(row.memo_to_surah, row.memo_to_ayah),
    memoTimeFrom: toHourMinute(row.memo_time_from),
    memoTimeTo: toHourMinute(row.memo_time_to),
    completed50Repetitions: row.completed_50_repetitions ?? null,
    repetitionsInSingleSession: row.repetitions_in_single_session ?? null,
    noRevisionToday: row.no_revision_today ?? null,
    revFrom: toPosition(row.rev_from_surah, row.rev_from_ayah),
    revTo: toPosition(row.rev_to_surah, row.rev_to_ayah),
    revTimeFrom: toHourMinute(row.rev_time_from),
    revTimeTo: toHourMinute(row.rev_time_to),
    readTafsir: row.read_tafsir ?? null,
    absenceReason: row.absence_reason ?? null,
  };
}

/**
 * The projection every daily-report read shares. Each stored ordinal is
 * reconstructed to its (surah, ayah) pair through `SURAH_POSITION_JOINS`
 * for display only (TS §23): the surah is the one with the greatest
 * `ordinal_offset` strictly below the ordinal and
 * `ayah = ordinal - ordinal_offset` (SAS §17.6). Ordinals never leave the
 * API (APIS §11). These fragments are literal SQL — no caller input is ever
 * interpolated; every value travels as a bound parameter (TS §36).
 */
const DAILY_REPORT_COLUMNS = `r.id,
              r.membership_id,
              r.report_date::text        AS report_date,
              r.type,
              r.submitted_at::text       AS submitted_at,
              r.submitted_timezone,
              r.no_memorization_today,
              mf.number                  AS memo_from_surah,
              r.memo_from_ordinal - mf.ordinal_offset AS memo_from_ayah,
              mt.number                  AS memo_to_surah,
              r.memo_to_ordinal - mt.ordinal_offset   AS memo_to_ayah,
              r.memo_time_from::text     AS memo_time_from,
              r.memo_time_to::text       AS memo_time_to,
              r.completed_50_repetitions,
              r.repetitions_in_single_session,
              r.no_revision_today,
              rf.number                  AS rev_from_surah,
              r.rev_from_ordinal - rf.ordinal_offset  AS rev_from_ayah,
              rt.number                  AS rev_to_surah,
              r.rev_to_ordinal - rt.ordinal_offset    AS rev_to_ayah,
              r.rev_time_from::text      AS rev_time_from,
              r.rev_time_to::text        AS rev_time_to,
              r.read_tafsir,
              r.absence_reason`;

const SURAH_POSITION_JOINS = `LEFT JOIN LATERAL (
           SELECT s.number, s.ordinal_offset FROM surahs s
            WHERE s.ordinal_offset < r.memo_from_ordinal
            ORDER BY s.ordinal_offset DESC LIMIT 1
         ) mf ON true
         LEFT JOIN LATERAL (
           SELECT s.number, s.ordinal_offset FROM surahs s
            WHERE s.ordinal_offset < r.memo_to_ordinal
            ORDER BY s.ordinal_offset DESC LIMIT 1
         ) mt ON true
         LEFT JOIN LATERAL (
           SELECT s.number, s.ordinal_offset FROM surahs s
            WHERE s.ordinal_offset < r.rev_from_ordinal
            ORDER BY s.ordinal_offset DESC LIMIT 1
         ) rf ON true
         LEFT JOIN LATERAL (
           SELECT s.number, s.ordinal_offset FROM surahs s
            WHERE s.ordinal_offset < r.rev_to_ordinal
            ORDER BY s.ordinal_offset DESC LIMIT 1
         ) rt ON true`;

/**
 * Optional `from`/`to` bounds and the keyset position, expressed as
 * nullable parameters `$2..$5` so each history statement stays ONE literal
 * query. `$6` is `limit + 1`. Order of {@link pageParameters} must match.
 */
const HISTORY_PAGE_PREDICATE = `AND ($2::date IS NULL OR r.report_date >= $2::date)
          AND ($3::date IS NULL OR r.report_date <= $3::date)
          AND ($4::date IS NULL
               OR r.report_date < $4::date
               OR (r.report_date = $4::date AND r.id < $5::uuid))`;

function pageParameters(
  params: DailyReportsPageParams,
): [string | null, string | null, string | null, string | null, number] {
  return [
    params.from,
    params.to,
    params.cursor?.sortKey.reportDate ?? null,
    params.cursor?.id ?? null,
    params.limit + 1,
  ];
}

function toPage(rows: RawDailyReportRow[], limit: number): DailyReportPage {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return { rows: page.map(toRecord), hasMore };
}

@Injectable()
export class DailyReportRepository implements IDailyReportRepository {
  constructor(
    @InjectRepository(DailyReportTypeOrmEntity)
    private readonly dailyReportRepo: Repository<DailyReportTypeOrmEntity>,
  ) {}

  async findTodayContextByUserId(
    userId: string,
  ): Promise<TodayReportContextRecord | null> {
    // One indexed lookup (DB-UQ-02 partial index on Active memberships),
    // scope applied in the WHERE clause (TS §15.2, SA §14 NFR-19 backstop).
    const rows = await this.dailyReportRepo.manager.query<RawTodayContextRow[]>(
      `SELECT m.id            AS membership_id,
              g.id            AS group_id,
              g.lifecycle_state,
              g.recitation_day,
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
      timezone: row.timezone,
    };
  }

  async create(report: DailyReport): Promise<string> {
    const id = uuidv7();
    // One INSERT, auto-committed (TS §19). Postgres accepts 'HH:MM' for TIME.
    await this.dailyReportRepo.insert({
      id,
      membershipId: report.membershipId,
      reportDate: report.reportDate,
      type: report.type,
      submittedAt: report.submittedAt,
      submittedTimezone: report.submittedTimezone,
      noMemorizationToday: report.noMemorizationToday,
      memoFromOrdinal: report.memoRange?.startOrdinal ?? null,
      memoToOrdinal: report.memoRange?.endOrdinal ?? null,
      memoTimeFrom: report.memoTime?.from ?? null,
      memoTimeTo: report.memoTime?.to ?? null,
      completed50Repetitions: report.completed50Repetitions,
      repetitionsInSingleSession: report.repetitionsInSingleSession,
      noRevisionToday: report.noRevisionToday,
      revFromOrdinal: report.revRange?.startOrdinal ?? null,
      revToOrdinal: report.revRange?.endOrdinal ?? null,
      revTimeFrom: report.revTime?.from ?? null,
      revTimeTo: report.revTime?.to ?? null,
      readTafsir: report.readTafsir,
      absenceReason: report.absenceReason,
      deletedAt: null,
    });
    return id;
  }

  async findByMembershipAndDate(
    membershipId: string,
    reportDate: string,
  ): Promise<DailyReportRecord | null> {
    // Hits DB-UQ-04 (membership_id, report_date) WHERE deleted_at IS NULL.
    // One literal, parameterised statement (TS §36).
    const rows = await this.dailyReportRepo.manager.query<RawDailyReportRow[]>(
      `SELECT ${DAILY_REPORT_COLUMNS}
         FROM daily_reports r
         ${SURAH_POSITION_JOINS}
        WHERE r.membership_id = $1
          AND r.report_date = $2::date
          AND r.deleted_at IS NULL
        LIMIT 1`,
      [membershipId, reportDate],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return toRecord(rows[0]);
  }

  async findDaySnapshotsByMembershipAndRange(
    membershipId: string,
    from: string,
    to: string,
  ): Promise<DatedDailyReportSnapshot[]> {
    // One DB-IDX-01 (membership_id, report_date) range walk — the query
    // DBD §26 lists for "Generate weekly report (current week, live)".
    // Only the VO-09 classification inputs are projected; the memo range
    // is reduced to its presence so no ordinal leaves the query.
    const rows = await this.dailyReportRepo.manager.query<RawDaySnapshotRow[]>(
      `SELECT r.report_date::text AS report_date,
              r.type,
              r.absence_reason,
              r.no_memorization_today,
              r.no_revision_today,
              (r.memo_from_ordinal IS NOT NULL) AS has_memo_range,
              r.completed_50_repetitions,
              r.repetitions_in_single_session
         FROM daily_reports r
        WHERE r.membership_id = $1
          AND r.report_date >= $2::date
          AND r.report_date <= $3::date
          AND r.deleted_at IS NULL
        ORDER BY r.report_date ASC`,
      [membershipId, from, to],
    );

    return rows.map((row) => ({
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

  async findOwnHistoryByUserId(
    params: FindOwnDailyReportsParams,
  ): Promise<DailyReportPage> {
    // Scope = the caller's Active membership, resolved by the join (DB-UQ-02
    // partial index on Active memberships). The report scan is a backward
    // range walk of DB-IDX-01 (membership_id, report_date), which serves
    // both the optional `from`/`to` bounds and the `report_date DESC` order
    // (APIS §9.4); `id DESC` (UUIDv7, time-ordered) is the tie-breaker that
    // makes the keyset cursor stable. The optional filters are expressed as
    // nullable parameters so the statement stays ONE literal, parameterised
    // query (TS §36). Ordinals resolve to (surah, ayah) as in
    // findByMembershipAndDate (TS §23, APIS §11). `LIMIT limit + 1` derives
    // `hasMore` without a COUNT (APIS §9.1).
    const rows = await this.dailyReportRepo.manager.query<RawDailyReportRow[]>(
      `SELECT ${DAILY_REPORT_COLUMNS}
         FROM memberships m
         JOIN daily_reports r ON r.membership_id = m.id
         ${SURAH_POSITION_JOINS}
        WHERE m.user_id = $1
          AND m.state = 'Active'
          AND r.deleted_at IS NULL
          ${HISTORY_PAGE_PREDICATE}
        ORDER BY r.report_date DESC, r.id DESC
        LIMIT $6`,
      [params.userId, ...pageParameters(params)],
    );

    return toPage(rows, params.limit);
  }

  async findHistoryByMembershipId(
    params: FindMembershipDailyReportsParams,
  ): Promise<DailyReportPage> {
    // API-032: the membership id already passed the route-specific
    // ScopeGuard (TS §15.2 step 4), so the query binds to exactly that id
    // and re-derives nothing. Same DB-IDX-01 backward range walk, same
    // keyset cursor, same `limit + 1` page as the own history above.
    const rows = await this.dailyReportRepo.manager.query<RawDailyReportRow[]>(
      `SELECT ${DAILY_REPORT_COLUMNS}
         FROM daily_reports r
         ${SURAH_POSITION_JOINS}
        WHERE r.membership_id = $1
          AND r.deleted_at IS NULL
          ${HISTORY_PAGE_PREDICATE}
        ORDER BY r.report_date DESC, r.id DESC
        LIMIT $6`,
      [params.membershipId, ...pageParameters(params)],
    );

    return toPage(rows, params.limit);
  }
}
