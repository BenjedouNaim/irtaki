import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { env } from '../support/env.js';

/**
 * Direct database access for what the API cannot do: move time backwards and
 * read side-effects that never reach the device (notification_log, audit).
 * Only the E2E database is ever touched (env.ts refuses `irtaki`).
 *
 * Immutability triggers guard UPDATEs on reports/payments/join requests, so
 * history is created by INSERTing rows with past dates, and memberships (no
 * triggers) are backdated with UPDATE.
 */

let pool: pg.Pool | undefined;

function db(): pg.Pool {
  pool ??= new pg.Pool({ ...env.db, max: 2 });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

export async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const r = await db().query<T>(sql, params);
  return r.rows;
}

/** Shift a membership's start (and so its payment cycles and expected days) into the past. */
export async function backdateMembership(membershipId: string, startedAt: string): Promise<void> {
  await query('UPDATE memberships SET started_at = $1, created_at = $1::date WHERE id = $2', [
    startedAt,
    membershipId,
  ]);
}

/**
 * A valid password-reset token for `userId`, stored the way TokenService does
 * (SHA-256 of the raw token, 30-minute expiry). Stands in for reading the email.
 */
export async function insertPasswordResetToken(
  userId: string,
  opts: { expired?: boolean } = {},
): Promise<string> {
  const raw = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(raw).digest('hex');
  await query(
    `INSERT INTO auth_tokens (id, user_id, token_hash, purpose, issued_at, expires_at)
     VALUES (gen_random_uuid(), $1, $2, 'password_reset', now(), now() + ($3 || ' minutes')::interval)`,
    [userId, hash, opts.expired ? '-5' : '30'],
  );
  return raw;
}

export async function setUserTimezone(userId: string, timezone: string): Promise<void> {
  await query('UPDATE users SET timezone = $1 WHERE id = $2', [timezone, userId]);
}

export async function membershipState(membershipId: string): Promise<string | undefined> {
  const rows = await query<{ state: string }>('SELECT state FROM memberships WHERE id = $1', [
    membershipId,
  ]);
  return rows[0]?.state;
}

export interface HistoricReport {
  date: string;
  type: 'Normal' | 'Absent' | 'Revision';
  absenceReason?: 'Sick' | 'Studying' | 'Other';
  /** Normal: memorized something (range on ordinal 1..7). Default true. */
  memorized?: boolean;
  completed50?: boolean;
  singleSession?: boolean;
  revised?: boolean;
}

/**
 * Insert a past daily report the way the submit use case would store it.
 * Ordinals are global ayah numbers (1 = Al-Fatiha 1); the defaults cover the
 * first surah, which is enough for weekly metrics and history screens.
 */
export async function insertDailyReport(membershipId: string, r: HistoricReport): Promise<void> {
  const isNormal = r.type === 'Normal';
  const memorized = isNormal && (r.memorized ?? true);
  const revised = r.type === 'Revision' || (isNormal && (r.revised ?? true));
  await query(
    `INSERT INTO daily_reports (
       id, membership_id, report_date, type, submitted_at, submitted_timezone,
       no_memorization_today, memo_from_ordinal, memo_to_ordinal, memo_time_from, memo_time_to,
       completed_50_repetitions, repetitions_in_single_session,
       no_revision_today, rev_from_ordinal, rev_to_ordinal, rev_time_from, rev_time_to,
       read_tafsir, absence_reason
     ) VALUES (
       gen_random_uuid(), $1, $2::date, $3, ($2::date + time '21:00') AT TIME ZONE $4, $4,
       $5, $6, $7, $8, $9,
       $10, $11,
       $12, $13, $14, $15, $16,
       $17, $18
     )`,
    [
      membershipId,
      r.date,
      r.type,
      env.timezone,
      isNormal ? !memorized : null,
      memorized ? 1 : null,
      memorized ? 7 : null,
      memorized ? '05:30' : null,
      memorized ? '06:15' : null,
      memorized ? (r.completed50 ?? true) : null,
      memorized ? (r.singleSession ?? true) : null,
      isNormal ? !revised : null,
      revised ? 8 : null,
      revised ? 20 : null,
      revised ? '18:00' : null,
      revised ? '18:30' : null,
      isNormal ? false : null,
      r.type === 'Absent' ? (r.absenceReason ?? 'Sick') : null,
    ],
  );
}

export async function notificationLog(
  userId: string,
  category: string,
): Promise<{ outcome: string; subject_id: string | null }[]> {
  return query('SELECT outcome, subject_id FROM notification_log WHERE user_id = $1 AND category = $2', [
    userId,
    category,
  ]);
}

export async function auditEntries(
  action: string,
  targetId?: string,
): Promise<{ actor_id: string; target_id: string | null }[]> {
  return targetId
    ? query('SELECT actor_id, target_id FROM audit_entries WHERE action = $1 AND target_id = $2', [
        action,
        targetId,
      ])
    : query('SELECT actor_id, target_id FROM audit_entries WHERE action = $1', [action]);
}
