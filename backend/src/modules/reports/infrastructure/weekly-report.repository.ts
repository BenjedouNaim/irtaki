import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  CurrentWeekContextRecord,
  IWeeklyReportRepository,
  NewWeeklyReport,
  WeeklyReportRecord,
  WeeklyReportState,
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
}
