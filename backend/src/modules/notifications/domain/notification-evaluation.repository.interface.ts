export const NOTIFICATION_EVALUATION_REPOSITORY = Symbol(
  'NOTIFICATION_EVALUATION_REPOSITORY',
);

/**
 * The candidate set of the two student-local evaluators (N-01, N-02): every
 * live membership with the three things ADR-030's per-row filter needs — the
 * holder's `users.timezone`, the group's `recitation_day`, and the ids the
 * payload and the log rows are keyed on.
 *
 * Group/membership state is carried so an obviously ineligible row is not
 * even considered; `NotificationService` re-checks §22.3 against a fresh
 * read regardless (SA §21), so this is a narrowing, never the decision.
 */
export interface ReminderCandidate {
  membershipId: string;
  /** The Student's `users.id` — the recipient of N-01 and N-02. */
  userId: string;
  /** T-01: the day-boundary authority for this row. */
  timezone: string;
  /** `groups.recitation_day`, ISO day-of-week 1..7. */
  recitationDay: number;
}

/** One membership as DS-04's predicate needs it (SAS §18.1/§18.4). */
export interface AtRiskCandidate {
  membershipId: string;
  /** `groups.teacher_id` — N-07's recipient (SAS §22.2). */
  teacherUserId: string;
  /** The Student's timezone — "today" for the EffectiveWindow (T-01). */
  timezone: string;
  recitationDay: number;
  /** `memberships.started_at`, `YYYY-MM-DD`. */
  startedAt: string;
  /** `memberships.ended_at`, `YYYY-MM-DD`; null while Active. */
  endedAt: string | null;
  /** `groups.archived_at` as `YYYY-MM-DD`; null while Active. */
  archivedAt: string | null;
  /** Newest LIVE `daily_reports.report_date`; null when never reported. */
  lastReportDate: string | null;
}

/** One membership as DS-06's ledger derivation needs it (SAS §18.5). */
export interface PaymentCandidate {
  membershipId: string;
  /** The Student's `users.id` — N-06's recipient. */
  userId: string;
  timezone: string;
  startedAt: string;
  endedAt: string | null;
  archivedAt: string | null;
  /** Every live `payment_records` row of the membership (DB-UQ-06). */
  paidCycles: Array<{ cycleIndex: number; paidAt: string }>;
}

/**
 * The scheduled evaluators' candidate reads. Like the dispatch-context
 * reads, these are the Notifications module's OWN parameterised indexed
 * queries (TS §15.2/§36) — DE-13/DE-14/DE-15 are, in DMS §17's own words,
 * "evaluated by the notification scheduler", so the evaluation lives here
 * and the pure predicates (DS-04, DS-06) are reused from their owning
 * modules' framework-free domain layers rather than restated.
 */
export interface INotificationEvaluationRepository {
  /** Live memberships of live groups — the N-01 / N-02 candidate set. */
  findReminderCandidates(): Promise<ReminderCandidate[]>;
  /** Live memberships of live groups with their newest report — N-07. */
  findAtRiskCandidates(): Promise<AtRiskCandidate[]>;
  /** Live memberships of live groups with their paid cycles — N-06. */
  findPaymentCandidates(): Promise<PaymentCandidate[]>;
}
