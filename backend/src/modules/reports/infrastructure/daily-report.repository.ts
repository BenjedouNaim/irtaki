import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DailyReportAyahPositionRecord,
  DailyReportRecord,
  IDailyReportRepository,
  TodayReportContextRecord,
} from '../domain/daily-report.repository.interface';
import { DailyReportTypeOrmEntity } from './daily-report.typeorm-entity';

interface RawTodayContextRow {
  membership_id: string;
  group_id: string;
  lifecycle_state: string;
  recitation_day: number | string;
  timezone: string;
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

/**
 * Resolves a global ordinal to its (surah, ayah) pair from the `surahs`
 * reference table: the surah is the one with the greatest `ordinal_offset`
 * strictly below the ordinal, and `ayah = ordinal - ordinal_offset`
 * (SAS §17.6 `ordinal = surahs[s].ordinal_offset + a`). Pure read of seeded
 * reference data (F-FND-06) — ordinals never leave the API (APIS §11).
 */
const SURAH_OF = (col: string): string =>
  `(SELECT s.number FROM surahs s WHERE s.ordinal_offset < r.${col} ORDER BY s.ordinal_offset DESC LIMIT 1)`;
const AYAH_OF = (col: string): string =>
  `(r.${col} - (SELECT s.ordinal_offset FROM surahs s WHERE s.ordinal_offset < r.${col} ORDER BY s.ordinal_offset DESC LIMIT 1))`;

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

  async findByMembershipAndDate(
    membershipId: string,
    reportDate: string,
  ): Promise<DailyReportRecord | null> {
    // Hits DB-UQ-04 (membership_id, report_date) WHERE deleted_at IS NULL.
    const rows = await this.dailyReportRepo.manager.query<RawDailyReportRow[]>(
      `SELECT r.id,
              r.membership_id,
              r.report_date::text        AS report_date,
              r.type,
              r.submitted_at::text       AS submitted_at,
              r.submitted_timezone,
              r.no_memorization_today,
              ${SURAH_OF('memo_from_ordinal')} AS memo_from_surah,
              ${AYAH_OF('memo_from_ordinal')}  AS memo_from_ayah,
              ${SURAH_OF('memo_to_ordinal')}   AS memo_to_surah,
              ${AYAH_OF('memo_to_ordinal')}    AS memo_to_ayah,
              r.memo_time_from::text     AS memo_time_from,
              r.memo_time_to::text       AS memo_time_to,
              r.completed_50_repetitions,
              r.repetitions_in_single_session,
              r.no_revision_today,
              ${SURAH_OF('rev_from_ordinal')}  AS rev_from_surah,
              ${AYAH_OF('rev_from_ordinal')}   AS rev_from_ayah,
              ${SURAH_OF('rev_to_ordinal')}    AS rev_to_surah,
              ${AYAH_OF('rev_to_ordinal')}     AS rev_to_ayah,
              r.rev_time_from::text      AS rev_time_from,
              r.rev_time_to::text        AS rev_time_to,
              r.read_tafsir,
              r.absence_reason
         FROM daily_reports r
        WHERE r.membership_id = $1
          AND r.report_date = $2::date
          AND r.deleted_at IS NULL
        LIMIT 1`,
      [membershipId, reportDate],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
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
}
