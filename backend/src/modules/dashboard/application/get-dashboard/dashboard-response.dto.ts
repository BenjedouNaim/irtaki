import type { PaymentCycleStatus } from '../../../payments/domain/payment-cycle';
import type { DailyReportBlockReason } from '../../../reports/domain/daily-report-eligibility';

/**
 * `DashboardResponseDto` (TS §13) — API-009's per-role `oneOf`.
 *
 * A **discriminated union keyed by the caller's own role**, with NO `type`
 * field on the wire: APIS §10.3 is explicit that "the client already knows
 * its own role from login, so no `type` field guessing is needed beyond
 * trusting the session". The discriminant therefore lives in the session,
 * not in the payload, and each arm below is exactly the payload APIS §10.3's
 * table gives that role — nothing added, nothing shared "for convenience".
 */

/** The statuses a caller still holding `role = User` can observe. */
export type UserJoinRequestStatus = 'Pending' | 'Rejected';

/**
 * `User` — "join entry point or status only (DEC-C09)".
 *
 * `pending_request_status` is present whenever the caller has ever submitted
 * a request and carries that request's status; absent when they never have.
 *
 * DOC CONFLICT (decided): APIS §10.3 types the field `?: "Pending"`, but
 * UF §10 opens with "Every dashboard is one `GET /me/dashboard` call, except
 * Student's Home" AND requires SCR-05 to render a `Rejected` status card
 * ("Not accepted this time" + "Apply again"). A field that can only ever say
 * `"Pending"` is fully determined by `has_pending_request` and would force
 * SCR-05 into a second call to `GET /join-requests/mine` — which UF §10
 * forbids. The union is therefore widened to the two statuses a `User` can
 * actually hold: `Accepted` is unobservable because acceptance atomically
 * promotes the caller to `Student` (APIS §10.5's own note on DS-01). Still
 * status only — no score, no profile, no rejection reason (DEC-C09).
 */
export interface UserDashboardDto {
  has_pending_request: boolean;
  pending_request_status?: UserJoinRequestStatus;
}

/** The Student's payment chip — three fields, not the whole ledger. */
export interface StudentPaymentDto {
  /** The CURRENT cycle's DS-06 status (UF §18's "current-cycle badge"). */
  status: PaymentCycleStatus;
  /** End of the earliest unpaid cycle (DEC-B06); null when none is unpaid. */
  next_due_date: string | null;
  arrears_count: number;
}

/**
 * `Student` — `{ can_submit_today, block_reason?, commitment_score,
 * payment }`.
 *
 * `commitment_score` and `payment` are null in exactly one situation: the
 * caller has no Active membership, which `block_reason = membership_inactive`
 * already reports (UF §10's "rare-race fallback, not a designed path").
 * Null is the honest answer there — never a defaulted `0` (DEC-B04/API-X07),
 * which the client would render as a real score of zero.
 */
export interface StudentDashboardDto {
  can_submit_today: boolean;
  block_reason?: DailyReportBlockReason;
  /** VO-06's mean of the defined components; null when none is defined. */
  commitment_score: number | null;
  payment: StudentPaymentDto | null;
}

/**
 * DEC-B09 made structural, not conventional.
 *
 * "The Assistant is excluded from Reports/Progress/Performance regardless of
 * group assignment" — "the single most consequence-bearing scope rule in the
 * whole system", and UF §10 adds that the exclusion must be *invisible*: "No
 * commitment/at-risk/submission-rate figure, ever, even disabled".
 *
 * Every performance key in the system is mapped to `never` here, so the
 * Assistant arms below cannot carry one *at the type level*: assigning any
 * value to `commitment_score`, `commitment_average`, `at_risk_count`,
 * `submission_rate` (…) on an Assistant payload is a compile error, not a
 * convention a future edit could quietly break. `get-dashboard.use-case.spec`
 * proves it with `@ts-expect-error`, which fails the build if the error ever
 * stops occurring.
 */
export type PerformanceField =
  | 'commitment_score'
  | 'commitment_average'
  | 'submission_rate'
  | 'at_risk_count'
  | 'at_risk'
  | 'attendance_rate'
  | 'memorization_rate'
  | 'revision_rate'
  | 'repetition_quality'
  | 'day_breakdown'
  | 'days_since_last_report'
  | 'absence_breakdown'
  | 'performance'
  | 'students';

/** Every performance-shaped key, pinned to `never`. */
export type NoPerformanceData = { [K in PerformanceField]?: never };

/** One assigned group on the Assistant's home — id, name, follow-up count. */
export type AssistantGroupDto = NoPerformanceData & {
  id: string;
  name: string;
  /**
   * How many students of the group the Assistant has to chase — those whose
   * CURRENT DS-06 cycle is `Unpaid` (UF §10: the count taps through to "a
   * filtered Payments view", and UF §18's `Unpaid` chip is that view).
   */
  payment_followup_count: number;
};

/** `Assistant` — `{ pending_request_count, groups }`, no performance data. */
export type AssistantDashboardDto = NoPerformanceData & {
  pending_request_count: number;
  groups: AssistantGroupDto[];
};

/** One assigned group on the Teacher's home (UF §10: "Home *is* the groups list"). */
export interface TeacherGroupDto {
  id: string;
  name: string;
  /** Mean of the members' defined scores; null when none is defined. */
  commitment_average: number | null;
  /** Size of the DEC-B05 at-risk set (API-040); a count, never a rate. */
  at_risk_count: number;
  /** Pooled over the member set; null when the group had no effective days. */
  submission_rate: number | null;
}

/** `Teacher` — `{ groups }` and nothing else. */
export interface TeacherDashboardDto {
  groups: TeacherGroupDto[];
}

/** `Admin` — "deliberately thin", four counts only. */
export interface AdminDashboardDto {
  group_count: number;
  staff_count: number;
  student_count: number;
  pending_recovery_count: number;
}

/** API-009's `oneOf`, selected by the caller's own role. */
export type DashboardDto =
  | UserDashboardDto
  | StudentDashboardDto
  | AssistantDashboardDto
  | TeacherDashboardDto
  | AdminDashboardDto;

/** APIS §9.1 single-resource envelope. */
export interface DashboardResponseDto {
  data: DashboardDto;
}
