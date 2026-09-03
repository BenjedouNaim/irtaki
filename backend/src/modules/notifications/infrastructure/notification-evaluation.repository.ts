import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AtRiskCandidate,
  INotificationEvaluationRepository,
  PaymentCandidate,
  ReminderCandidate,
} from '../domain/notification-evaluation.repository.interface';

interface RawReminderRow {
  membership_id: string;
  user_id: string;
  timezone: string;
  recitation_day: number | string;
}

interface RawAtRiskRow {
  membership_id: string;
  teacher_user_id: string;
  timezone: string;
  recitation_day: number | string;
  started_at: string;
  ended_at: string | null;
  archived_at: string | null;
  last_report_date: string | null;
}

interface RawPaymentRow {
  membership_id: string;
  user_id: string;
  timezone: string;
  started_at: string;
  ended_at: string | null;
  archived_at: string | null;
  paid_cycles: Array<{ cycle_index: number; paid_at: string }> | null;
}

/**
 * The four scheduled evaluators' candidate reads (DE-13/DE-14/DE-15 —
 * "evaluated by the notification scheduler", DMS §17).
 *
 * Each is one literal parameterised statement (TS §36) over indexed columns,
 * issued from this module's own infrastructure for the SA §11 reason spelled
 * out on `NotificationDispatchContextRepository`. The candidate set is
 * deliberately narrow — `Active` memberships of `Active` groups — but never
 * the decision: `NotificationService` re-reads §22.3 before every send
 * (SA §21), so a row that changes state between the sweep and the dispatch
 * is caught there.
 *
 * `archived_at` is projected as a calendar date in the STUDENT's timezone,
 * because it bounds `EffectiveWindow(m)` (SAS §18.1) which is evaluated in
 * exactly that timezone (T-01, INV-27).
 */
@Injectable()
export class NotificationEvaluationRepository implements INotificationEvaluationRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findReminderCandidates(): Promise<ReminderCandidate[]> {
    const rows = await this.dataSource.query<RawReminderRow[]>(
      `SELECT m.id   AS membership_id,
              m.user_id,
              u.timezone,
              g.recitation_day
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users u ON u.id = m.user_id
        WHERE m.state = 'Active'
          AND g.lifecycle_state = 'Active'`,
      [],
    );
    return rows.map((row) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      timezone: row.timezone,
      recitationDay: Number(row.recitation_day),
    }));
  }

  async findAtRiskCandidates(): Promise<AtRiskCandidate[]> {
    const rows = await this.dataSource.query<RawAtRiskRow[]>(
      `SELECT m.id AS membership_id,
              g.teacher_id AS teacher_user_id,
              u.timezone,
              g.recitation_day,
              m.started_at::text AS started_at,
              m.ended_at::text   AS ended_at,
              (g.archived_at AT TIME ZONE u.timezone)::date::text AS archived_at,
              (SELECT MAX(d.report_date)::text
                 FROM daily_reports d
                WHERE d.membership_id = m.id
                  AND d.deleted_at IS NULL) AS last_report_date
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users u ON u.id = m.user_id
        WHERE m.state = 'Active'
          AND g.lifecycle_state = 'Active'`,
      [],
    );
    return rows.map((row) => ({
      membershipId: row.membership_id,
      teacherUserId: row.teacher_user_id,
      timezone: row.timezone,
      recitationDay: Number(row.recitation_day),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      archivedAt: row.archived_at,
      lastReportDate: row.last_report_date,
    }));
  }

  async findPaymentCandidates(): Promise<PaymentCandidate[]> {
    const rows = await this.dataSource.query<RawPaymentRow[]>(
      `SELECT m.id AS membership_id,
              m.user_id,
              u.timezone,
              m.started_at::text AS started_at,
              m.ended_at::text   AS ended_at,
              (g.archived_at AT TIME ZONE u.timezone)::date::text AS archived_at,
              (SELECT COALESCE(
                        json_agg(json_build_object(
                          'cycle_index', p.cycle_index,
                          'paid_at', p.paid_at
                        ) ORDER BY p.cycle_index),
                        '[]'::json)
                 FROM payment_records p
                WHERE p.membership_id = m.id
                  AND p.deleted_at IS NULL) AS paid_cycles
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users u ON u.id = m.user_id
        WHERE m.state = 'Active'
          AND g.lifecycle_state = 'Active'`,
      [],
    );
    return rows.map((row) => ({
      membershipId: row.membership_id,
      userId: row.user_id,
      timezone: row.timezone,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      archivedAt: row.archived_at,
      paidCycles: (row.paid_cycles ?? []).map((paid) => ({
        cycleIndex: Number(paid.cycle_index),
        paidAt: new Date(paid.paid_at).toISOString(),
      })),
    }));
  }
}
