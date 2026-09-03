import { Inject, Injectable } from '@nestjs/common';
import {
  JOIN_REQUEST_REPOSITORY,
  type IJoinRequestRepository,
} from '../../../enrollment/domain/join-request.repository.interface';
import { ListGroupsUseCase } from '../../../groups/application/list-groups/list-groups.use-case';
import {
  GROUP_REPOSITORY,
  type IGroupRepository,
} from '../../../groups/domain/group.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  USER_REPOSITORY,
  type IUserRepository,
} from '../../../identity/domain/user.repository.interface';
import {
  MEMBERSHIP_REPOSITORY,
  type IMembershipRepository,
} from '../../../memberships/domain/membership.repository.interface';
import { GetGroupPaymentLedgerUseCase } from '../../../payments/application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import { GetOwnPaymentLedgerUseCase } from '../../../payments/application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import { GetAtRiskListUseCase } from '../../../performance/application/get-at-risk-list/get-at-risk-list.use-case';
import { GetGroupPerformanceUseCase } from '../../../performance/application/get-group-performance/get-group-performance.use-case';
import { GetOwnPerformanceUseCase } from '../../../performance/application/get-own-performance/get-own-performance.use-case';
import { GetTodayReportStatusUseCase } from '../../../reports/application/get-today-report-status/get-today-report-status.use-case';
import {
  AdminDashboardDto,
  AssistantDashboardDto,
  AssistantGroupDto,
  DashboardResponseDto,
  StudentDashboardDto,
  TeacherDashboardDto,
  TeacherGroupDto,
  UserDashboardDto,
  UserJoinRequestStatus,
} from './dashboard-response.dto';

/**
 * UC-02 `GetDashboardUseCase` (TS §12 — "composes Performance/Progress/
 * Payments reads behind one call", "cross-module orchestrator, no owning
 * module"; TS §13 maps it to `DashboardController.get`).
 *
 * API-009 `GET /me/dashboard` is a **server-side fan-out**: SA §20's
 * "dedicated endpoint per dashboard, one round trip", chosen because "six-
 * to-eight separate calls on a poor connection would exhaust [NFR-11's 3s
 * /3G] budget on latency alone". One HTTP call in, one payload out — the
 * per-role composition below is the only thing that fans out, and it fans
 * out over module reads that already exist rather than re-deriving anything.
 *
 * **Nothing here is a new domain concept** (APIS §10.3: "an API-layer
 * aggregation only"). Every figure is produced by the module that owns it,
 * through that module's own exported application use case wherever one
 * exists:
 *
 * | Field | Composed from |
 * |---|---|
 * | `has_pending_request` / `pending_request_status` | Enrollment (F-ENR-02's own `join_requests` read) |
 * | `can_submit_today` / `block_reason` | Reports `GetTodayReportStatusUseCase` (F-DR-01 / API-029) |
 * | `commitment_score` | Performance `GetOwnPerformanceUseCase` (F-PERF-01 / API-037) |
 * | `payment` | Payments `GetOwnPaymentLedgerUseCase` (F-PAY-01 / API-045) |
 * | `pending_request_count` | Enrollment (the review queue's own scope predicate) |
 * | `payment_followup_count` | Payments `GetGroupPaymentLedgerUseCase` (F-PAY-02 / API-046) |
 * | `commitment_average`, `submission_rate` | Performance `GetGroupPerformanceUseCase` (F-PERF-02 / API-038) |
 * | `at_risk_count` | Performance `GetAtRiskListUseCase` (F-PERF-04 / API-040) |
 * | group `id` / `name` | Groups `ListGroupsUseCase` (API-010), already scope-filtered per caller |
 * | the four Admin counts | Groups, Identity and Memberships, one `COUNT` each |
 *
 * The four count reads have no use case to borrow, so they come from the
 * owning modules' **exported repository tokens** — the same public surface
 * Performance already consumes from Reports (`DAILY_REPORT_REPOSITORY`).
 * No repository is used to resolve scope here: `ListGroupsUseCase` scopes
 * the staff group sets, and the two per-group Performance use cases each
 * re-scope on `(groupId, callerId)` inside their own module (TS §15.2).
 *
 * **DEC-B09 is enforced by construction, not by care.** The Assistant branch
 * never touches a Performance use case at all, and `AssistantDashboardDto`
 * pins every performance key to `never` so it could not carry one if it did
 * (UF §10: "No commitment/at-risk/submission-rate figure, ever, even
 * disabled").
 */
@Injectable()
export class GetDashboardUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepository: IJoinRequestRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepository: IGroupRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: IMembershipRepository,
    private readonly listGroupsUseCase: ListGroupsUseCase,
    private readonly getTodayReportStatusUseCase: GetTodayReportStatusUseCase,
    private readonly getOwnPerformanceUseCase: GetOwnPerformanceUseCase,
    private readonly getOwnPaymentLedgerUseCase: GetOwnPaymentLedgerUseCase,
    private readonly getGroupPerformanceUseCase: GetGroupPerformanceUseCase,
    private readonly getAtRiskListUseCase: GetAtRiskListUseCase,
    private readonly getGroupPaymentLedgerUseCase: GetGroupPaymentLedgerUseCase,
  ) {}

  async execute(
    userId: string,
    role: UserRole,
    now: Date = new Date(),
  ): Promise<DashboardResponseDto> {
    switch (role) {
      case UserRole.User:
        return { data: await this.composeUser(userId) };
      case UserRole.Student:
        return { data: await this.composeStudent(userId, now) };
      case UserRole.Assistant:
        return { data: await this.composeAssistant(userId, now) };
      case UserRole.Teacher:
        return { data: await this.composeTeacher(userId, now) };
      case UserRole.Admin:
        return { data: await this.composeAdmin() };
    }
  }

  /**
   * `User` — "join entry point or status only" (APIS §10.3, UF §10's three
   * SCR-05 states). One `join_requests` read, the same
   * `findLatestForUser` F-ENR-02's `GET /join-requests/mine` issues, so the
   * two views of the applicant's own status can never disagree. Never
   * having applied is the absence of the optional key, not a status value —
   * API-029 sets the same precedent for optional keys.
   *
   * DEC-C09 holds: the record's `score` and profile are read but never
   * projected; only the status leaves this method.
   */
  private async composeUser(userId: string): Promise<UserDashboardDto> {
    const record = await this.joinRequestRepository.findLatestForUser(userId);
    if (!record) {
      return { has_pending_request: false };
    }

    const status = record.status as UserJoinRequestStatus;
    return {
      has_pending_request: status === 'Pending',
      pending_request_status: status,
    };
  }

  /**
   * `Student` — the SCR-08 hub: the daily-report CTA state machine, the
   * commitment score and the payment chip (UF §10).
   *
   * API-029 is awaited first because it is also the membership probe: when
   * it answers `membership_inactive` the caller has no Active membership
   * (VR-35), which is exactly the state in which API-037 and API-045 answer
   * `404`. Short-circuiting there keeps a rare race (UF §10: "not a designed
   * path") from turning the whole dashboard into a 404, without catching an
   * exception for control flow. `commitment_score` and `payment` are then
   * null — the honest answer, never a defaulted `0` (DEC-B04/API-X07).
   *
   * `existing_report` is deliberately NOT forwarded: APIS §10.3's Student
   * row lists four keys and it is not among them. The read-only view behind
   * "View Today's Report" is API-029's own payload, on the drill-down route
   * §10.3 points at for detail.
   *
   * `?period=` is omitted from the performance read, which resolves to the
   * current reporting week (UC-07 step 1) — the same figure SCR-13's default
   * period shows, so Home and the Progress tab never disagree.
   */
  private async composeStudent(
    userId: string,
    now: Date,
  ): Promise<StudentDashboardDto> {
    const today = await this.getTodayReportStatusUseCase.execute(userId, now);
    const { can_submit, block_reason } = today.data;

    if (block_reason === 'membership_inactive') {
      return {
        can_submit_today: false,
        block_reason,
        commitment_score: null,
        payment: null,
      };
    }

    const [performance, ledger] = await Promise.all([
      this.getOwnPerformanceUseCase.execute(userId, {}, now),
      this.getOwnPaymentLedgerUseCase.execute(userId, now),
    ]);

    // UF §18's "current-cycle badge": the last cycle DS-06 generated, since
    // generation runs up to today or the FR-PAY-12 stop. A membership always
    // has cycle 0 from creation (UF §18: "No empty state"), so the absence
    // of a cycle is unreachable rather than a designed null.
    const cycles = ledger.data.cycles;
    const current = cycles[cycles.length - 1];

    return {
      can_submit_today: can_submit,
      ...(block_reason ? { block_reason } : {}),
      commitment_score: performance.data.commitment_score,
      payment: current
        ? {
            status: current.status,
            next_due_date: ledger.data.next_due_date,
            arrears_count: ledger.data.arrears_count,
          }
        : null,
    };
  }

  /**
   * `Assistant` — the pending-request tile and one row per assigned group
   * (UF §10's two summary tiles).
   *
   * **No Performance read appears in this method, at all** (DEC-B09). The
   * exclusion is invisible rather than disabled: nothing performance-shaped
   * is fetched, computed or emitted.
   *
   * The group set comes from `ListGroupsUseCase`, which resolves an
   * Assistant's assignment inside the Groups module (API-010's "scope-
   * filtered server-side per caller"), and each group's follow-up count from
   * API-046's own ledger derivation with the `Unpaid` filter — the very
   * query the tile taps through to (UF §10 → UF §18's `Unpaid` chip), so the
   * number on Home is by construction the length of the list it opens.
   */
  private async composeAssistant(
    userId: string,
    now: Date,
  ): Promise<AssistantDashboardDto> {
    const [pendingRequestCount, groups] = await Promise.all([
      this.joinRequestRepository.countPendingForAssistant(userId),
      this.listGroupsUseCase.execute(userId, UserRole.Assistant),
    ]);

    const rows: AssistantGroupDto[] = [];
    for (const group of groups.data) {
      const ledgers = await this.getGroupPaymentLedgerUseCase.execute(
        group.id,
        { status: 'Unpaid' },
        now,
      );
      rows.push({
        id: group.id,
        name: group.name,
        payment_followup_count: ledgers.data.length,
      });
    }

    return { pending_request_count: pendingRequestCount, groups: rows };
  }

  /**
   * `Teacher` — "Home *is* the groups list, no separate summary layer"
   * (UF §10): one card per assigned group carrying API-038's two group
   * figures and API-040's at-risk count. Zero groups is an empty array, not
   * an error — UF §10 renders "No groups assigned yet" with no CTA.
   *
   * Both Performance reads re-resolve `(groupId, callerId)` inside the
   * Performance module (`findContext`), so a group that is not this
   * Teacher's cannot be composed in even though the id came from a list this
   * orchestrator produced — SA §14's second layer, unchanged by the
   * aggregation. `?period=` is omitted, resolving to the current reporting
   * week: the same default SCR-23's group view opens on.
   *
   * Groups are composed one at a time so a Teacher with many assignments
   * cannot open a connection per group at once; the two reads WITHIN a group
   * run together, which is where the latency actually is.
   */
  private async composeTeacher(
    userId: string,
    now: Date,
  ): Promise<TeacherDashboardDto> {
    const groups = await this.listGroupsUseCase.execute(
      userId,
      UserRole.Teacher,
    );

    const rows: TeacherGroupDto[] = [];
    for (const group of groups.data) {
      const [performance, atRisk] = await Promise.all([
        this.getGroupPerformanceUseCase.execute(userId, group.id, {}, now),
        this.getAtRiskListUseCase.execute(userId, group.id, now),
      ]);

      rows.push({
        id: group.id,
        name: group.name,
        commitment_average: performance.data.commitment_average,
        at_risk_count: atRisk.data.length,
        submission_rate: performance.data.submission_rate,
      });
    }

    return { groups: rows };
  }

  /**
   * `Admin` — "deliberately thin, since Admin's real workflow is list-based
   * navigation, not a metrics dashboard" (APIS §10.3). Four counts, three
   * modules, one `COUNT` each, all in parallel.
   *
   * `staff_count` is Teacher + Assistant: "staff" names that pair everywhere
   * in the specs (UC-17's `PromotionTargetRole`, `PATCH /groups/{id}/staff`,
   * INV-07), and the Admin is a singleton by INV-02 rather than a population
   * to count. The tile taps into the users list "filtered to staff roles"
   * (UF §10), which is that same pair.
   */
  private async composeAdmin(): Promise<AdminDashboardDto> {
    const [groupCount, roleCounts, terminatedCount] = await Promise.all([
      this.groupRepository.countAll(),
      this.userRepository.countByRole(),
      this.membershipRepository.countByState('Terminated'),
    ]);

    return {
      group_count: groupCount,
      staff_count:
        (roleCounts[UserRole.Teacher] ?? 0) +
        (roleCounts[UserRole.Assistant] ?? 0),
      student_count: roleCounts[UserRole.Student] ?? 0,
      pending_recovery_count: terminatedCount,
    };
  }
}
