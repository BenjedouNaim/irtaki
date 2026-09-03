import { apiClient } from './client';
import type { DailyReportBlockReason } from './dailyReports.client';
import type { PaymentCycleStatus } from './payments.client';

/**
 * API-009 `GET /me/dashboard` (APIS §10.3) — the role-keyed home payload,
 * one HTTP round trip for the whole screen (SA §20, NFR-11).
 *
 * The union is **discriminated by the caller's own role**, which the client
 * already holds from login, so nothing on the wire says which arm arrived:
 * "no `type` field guessing is needed beyond trusting the session".
 */

/** The two statuses a caller still holding `role = User` can observe. */
export type UserJoinRequestStatus = 'Pending' | 'Rejected';

/** SCR-05 — join entry point or status only (DEC-C09). */
export interface UserDashboardDto {
  has_pending_request: boolean;
  /** Absent when the caller has never applied. */
  pending_request_status?: UserJoinRequestStatus;
}

/** SCR-08's payment chip — the current cycle only, never the whole ledger. */
export interface StudentPaymentDto {
  status: PaymentCycleStatus;
  /** End of the earliest unpaid cycle; null when none is unpaid. */
  next_due_date: string | null;
  arrears_count: number;
}

/** SCR-08 — the CTA state, the commitment score and the payment chip. */
export interface StudentDashboardDto {
  can_submit_today: boolean;
  block_reason?: DailyReportBlockReason;
  /** Null when no component of VO-06 is defined — never 0 (DEC-B04). */
  commitment_score: number | null;
  /** Null only when the caller has no Active membership (rare race). */
  payment: StudentPaymentDto | null;
}

/**
 * DEC-B09 carried across the wire into the client's own types.
 *
 * "The Assistant is excluded from Reports/Progress/Performance regardless of
 * group assignment", and UF §10 adds that the exclusion is invisible: "No
 * commitment/at-risk/submission-rate figure, ever, even disabled". Mapping
 * every performance key to `never` means an Assistant screen cannot read one
 * off this payload even if the server ever regressed and sent it — the
 * mistake is a compile error here, not a rendered figure.
 */
type PerformanceField =
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

type NoPerformanceData = { [K in PerformanceField]?: never };

/** One assigned group on SCR-17. */
export type AssistantGroupDto = NoPerformanceData & {
  id: string;
  name: string;
  /** Students of the group whose current cycle is `Unpaid` (UF §10 → §18). */
  payment_followup_count: number;
};

/** SCR-17 — the review queue size and the assigned groups. */
export type AssistantDashboardDto = NoPerformanceData & {
  pending_request_count: number;
  groups: AssistantGroupDto[];
};

/** One card on SCR-22 — "Home *is* the groups list" (UF §10). */
export interface TeacherGroupDto {
  id: string;
  name: string;
  /** Null when no member has a defined score — never 0 (DEC-B04). */
  commitment_average: number | null;
  at_risk_count: number;
  submission_rate: number | null;
}

/** SCR-22 — one card per assigned group and nothing else. */
export interface TeacherDashboardDto {
  groups: TeacherGroupDto[];
}

/** SCR-26 — "deliberately thin", four counts. */
export interface AdminDashboardDto {
  group_count: number;
  staff_count: number;
  student_count: number;
  pending_recovery_count: number;
}

export type DashboardDto =
  | UserDashboardDto
  | StudentDashboardDto
  | AssistantDashboardDto
  | TeacherDashboardDto
  | AdminDashboardDto;

/** APIS §9.1 single-resource envelope. */
export interface DashboardResponse {
  data: DashboardDto;
}

/**
 * Reads the caller's own role-appropriate home payload and unwraps the
 * APIS §9.1 envelope. The server keys the response off the session's role,
 * so the caller never asks for an arm — it receives its own.
 */
export async function getMyDashboard(): Promise<DashboardDto> {
  const response = await apiClient.get<DashboardResponse>('/me/dashboard');
  return response.data;
}
