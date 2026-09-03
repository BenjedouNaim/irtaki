/* eslint-disable @typescript-eslint/unbound-method */
import { UserRole } from '../../../identity/domain/user-role.enum';
import type { IJoinRequestRepository } from '../../../enrollment/domain/join-request.repository.interface';
import type { IGroupRepository } from '../../../groups/domain/group.repository.interface';
import type { IUserRepository } from '../../../identity/domain/user.repository.interface';
import type { IMembershipRepository } from '../../../memberships/domain/membership.repository.interface';
import type { ListGroupsUseCase } from '../../../groups/application/list-groups/list-groups.use-case';
import type { GetGroupPaymentLedgerUseCase } from '../../../payments/application/get-group-payment-ledger/get-group-payment-ledger.use-case';
import type { GetOwnPaymentLedgerUseCase } from '../../../payments/application/get-own-payment-ledger/get-own-payment-ledger.use-case';
import type { GetAtRiskListUseCase } from '../../../performance/application/get-at-risk-list/get-at-risk-list.use-case';
import type { GetGroupPerformanceUseCase } from '../../../performance/application/get-group-performance/get-group-performance.use-case';
import type { GetOwnPerformanceUseCase } from '../../../performance/application/get-own-performance/get-own-performance.use-case';
import type { GetTodayReportStatusUseCase } from '../../../reports/application/get-today-report-status/get-today-report-status.use-case';
import type {
  AssistantDashboardDto,
  AssistantGroupDto,
  StudentDashboardDto,
  TeacherDashboardDto,
} from './dashboard-response.dto';
import { GetDashboardUseCase } from './get-dashboard.use-case';

describe('GetDashboardUseCase (F-DASH-01 / API-009)', () => {
  const now = new Date('2026-09-03T09:00:00.000Z');

  let joinRequestRepository: jest.Mocked<IJoinRequestRepository>;
  let groupRepository: jest.Mocked<IGroupRepository>;
  let userRepository: jest.Mocked<IUserRepository>;
  let membershipRepository: jest.Mocked<IMembershipRepository>;
  let listGroups: jest.Mocked<Pick<ListGroupsUseCase, 'execute'>>;
  let todayStatus: jest.Mocked<Pick<GetTodayReportStatusUseCase, 'execute'>>;
  let ownPerformance: jest.Mocked<Pick<GetOwnPerformanceUseCase, 'execute'>>;
  let ownLedger: jest.Mocked<Pick<GetOwnPaymentLedgerUseCase, 'execute'>>;
  let groupPerformance: jest.Mocked<
    Pick<GetGroupPerformanceUseCase, 'execute'>
  >;
  let atRisk: jest.Mocked<Pick<GetAtRiskListUseCase, 'execute'>>;
  let groupLedger: jest.Mocked<Pick<GetGroupPaymentLedgerUseCase, 'execute'>>;
  let useCase: GetDashboardUseCase;

  function build(): GetDashboardUseCase {
    return new GetDashboardUseCase(
      joinRequestRepository,
      groupRepository,
      userRepository,
      membershipRepository,
      listGroups as unknown as ListGroupsUseCase,
      todayStatus as unknown as GetTodayReportStatusUseCase,
      ownPerformance as unknown as GetOwnPerformanceUseCase,
      ownLedger as unknown as GetOwnPaymentLedgerUseCase,
      groupPerformance as unknown as GetGroupPerformanceUseCase,
      atRisk as unknown as GetAtRiskListUseCase,
      groupLedger as unknown as GetGroupPaymentLedgerUseCase,
    );
  }

  beforeEach(() => {
    joinRequestRepository = {
      create: jest.fn(),
      existsPendingForUser: jest.fn(),
      findLatestForUser: jest.fn(),
      findByIdForDetail: jest.fn(),
      findPendingQueue: jest.fn(),
      countPendingForAssistant: jest.fn(),
      acceptConditionally: jest.fn(),
      rejectConditionally: jest.fn(),
    };

    groupRepository = {
      countAll: jest.fn(),
    } as unknown as jest.Mocked<IGroupRepository>;

    userRepository = {
      countByRole: jest.fn(),
    } as unknown as jest.Mocked<IUserRepository>;

    membershipRepository = {
      countByState: jest.fn(),
    } as unknown as jest.Mocked<IMembershipRepository>;

    listGroups = { execute: jest.fn() };
    todayStatus = { execute: jest.fn() };
    ownPerformance = { execute: jest.fn() };
    ownLedger = { execute: jest.fn() };
    groupPerformance = { execute: jest.fn() };
    atRisk = { execute: jest.fn() };
    groupLedger = { execute: jest.fn() };

    useCase = build();
  });

  // ── User (SCR-05) ────────────────────────────────────────────────────────

  describe('User', () => {
    it('reports no pending request and omits the status when none was ever submitted', async () => {
      joinRequestRepository.findLatestForUser.mockResolvedValue(null);

      const result = await useCase.execute('user-1', UserRole.User, now);

      expect(result).toEqual({ data: { has_pending_request: false } });
      expect(result.data).not.toHaveProperty('pending_request_status');
    });

    it('reports a Pending request with its status', async () => {
      joinRequestRepository.findLatestForUser.mockResolvedValue({
        status: 'Pending',
        score: 91.5,
        fullName: 'طالب',
      } as never);

      const result = await useCase.execute('user-1', UserRole.User, now);

      expect(result).toEqual({
        data: { has_pending_request: true, pending_request_status: 'Pending' },
      });
    });

    it('reports a Rejected request as a terminal status with no pending flag (UF §10)', async () => {
      joinRequestRepository.findLatestForUser.mockResolvedValue({
        status: 'Rejected',
        score: 40,
      } as never);

      const result = await useCase.execute('user-1', UserRole.User, now);

      expect(result).toEqual({
        data: {
          has_pending_request: false,
          pending_request_status: 'Rejected',
        },
      });
    });

    it('never leaks the score or the profile the record carries (DEC-C09)', async () => {
      joinRequestRepository.findLatestForUser.mockResolvedValue({
        status: 'Pending',
        score: 91.5,
        fullName: 'طالب العلم',
        phoneNumber: '+21698123456',
        city: 'تونس',
      } as never);

      const result = await useCase.execute('user-1', UserRole.User, now);

      const wire = JSON.stringify(result);
      expect(wire).not.toContain('score');
      expect(wire).not.toContain('91.5');
      expect(wire).not.toContain('طالب العلم');
      expect(wire).not.toContain('21698123456');
    });
  });

  // ── Student (SCR-08) ─────────────────────────────────────────────────────

  describe('Student', () => {
    const ledger = {
      data: {
        cycles: [
          {
            index: 0,
            start_date: '2026-03-01',
            end_date: '2026-05-31',
            status: 'Paid' as const,
            paid_at: '2026-03-02T10:00:00.000Z',
          },
          {
            index: 1,
            start_date: '2026-06-01',
            end_date: '2026-08-31',
            status: 'Unpaid' as const,
          },
        ],
        next_due_date: '2026-08-31',
        arrears_count: 1,
      },
    };

    it('composes the CTA state, the score and the payment chip in one pass', async () => {
      todayStatus.execute.mockResolvedValue({ data: { can_submit: true } });
      ownPerformance.execute.mockResolvedValue({
        data: { commitment_score: 78.4 },
      } as never);
      ownLedger.execute.mockResolvedValue(ledger);

      const result = await useCase.execute('student-1', UserRole.Student, now);

      expect(result.data).toEqual({
        can_submit_today: true,
        commitment_score: 78.4,
        payment: {
          status: 'Unpaid',
          next_due_date: '2026-08-31',
          arrears_count: 1,
        },
      });
      expect(result.data).not.toHaveProperty('block_reason');
      expect(todayStatus.execute).toHaveBeenCalledWith('student-1', now);
      expect(ownPerformance.execute).toHaveBeenCalledWith('student-1', {}, now);
      expect(ownLedger.execute).toHaveBeenCalledWith('student-1', now);
    });

    it('forwards block_reason but never the existing report (APIS §10.3 lists four keys)', async () => {
      todayStatus.execute.mockResolvedValue({
        data: {
          can_submit: false,
          block_reason: 'already_submitted',
          existing_report: { id: 'report-1', report_date: '2026-09-03' },
        },
      } as never);
      ownPerformance.execute.mockResolvedValue({
        data: { commitment_score: null },
      } as never);
      ownLedger.execute.mockResolvedValue(ledger);

      const result = await useCase.execute('student-1', UserRole.Student, now);

      expect(result.data).toHaveProperty('block_reason', 'already_submitted');
      expect(result.data).not.toHaveProperty('existing_report');
      expect(JSON.stringify(result)).not.toContain('report-1');
    });

    it('keeps a null commitment score null — never 0 (DEC-B04 / API-X07)', async () => {
      todayStatus.execute.mockResolvedValue({ data: { can_submit: true } });
      ownPerformance.execute.mockResolvedValue({
        data: { commitment_score: null },
      } as never);
      ownLedger.execute.mockResolvedValue(ledger);

      const result = await useCase.execute('student-1', UserRole.Student, now);

      expect((result.data as StudentDashboardDto).commitment_score).toBeNull();
    });

    it('short-circuits on membership_inactive without touching Performance or Payments', async () => {
      todayStatus.execute.mockResolvedValue({
        data: { can_submit: false, block_reason: 'membership_inactive' },
      });

      const result = await useCase.execute('student-1', UserRole.Student, now);

      expect(result.data).toEqual({
        can_submit_today: false,
        block_reason: 'membership_inactive',
        commitment_score: null,
        payment: null,
      });
      expect(ownPerformance.execute).not.toHaveBeenCalled();
      expect(ownLedger.execute).not.toHaveBeenCalled();
    });
  });

  // ── Assistant (SCR-17) — DEC-B09 ─────────────────────────────────────────

  describe('Assistant', () => {
    beforeEach(() => {
      joinRequestRepository.countPendingForAssistant.mockResolvedValue(7);
      listGroups.execute.mockResolvedValue({
        data: [
          { id: 'group-a', name: 'مجموعة أ' },
          { id: 'group-b', name: 'مجموعة ب' },
        ],
      } as never);
      groupLedger.execute
        .mockResolvedValueOnce({ data: [{}, {}, {}] } as never)
        .mockResolvedValueOnce({ data: [] });
    });

    it('composes the pending count and one row per assigned group', async () => {
      const result = await useCase.execute(
        'assistant-1',
        UserRole.Assistant,
        now,
      );

      expect(result.data).toEqual({
        pending_request_count: 7,
        groups: [
          { id: 'group-a', name: 'مجموعة أ', payment_followup_count: 3 },
          { id: 'group-b', name: 'مجموعة ب', payment_followup_count: 0 },
        ],
      });
      expect(
        joinRequestRepository.countPendingForAssistant,
      ).toHaveBeenCalledWith('assistant-1');
      expect(listGroups.execute).toHaveBeenCalledWith(
        'assistant-1',
        UserRole.Assistant,
      );
    });

    it("counts the group's Unpaid ledgers — the same set the tile taps into (UF §10/§18)", async () => {
      await useCase.execute('assistant-1', UserRole.Assistant, now);

      expect(groupLedger.execute).toHaveBeenCalledWith(
        'group-a',
        { status: 'Unpaid' },
        now,
      );
    });

    /**
     * DEC-B09 at run time: the Assistant branch must not merely omit
     * performance figures from the payload — it must never ASK for them.
     */
    it('never invokes a Performance read (DEC-B09)', async () => {
      await useCase.execute('assistant-1', UserRole.Assistant, now);

      expect(ownPerformance.execute).not.toHaveBeenCalled();
      expect(groupPerformance.execute).not.toHaveBeenCalled();
      expect(atRisk.execute).not.toHaveBeenCalled();
    });

    it('emits no performance-shaped key anywhere in the payload (UF §10)', async () => {
      const result = await useCase.execute(
        'assistant-1',
        UserRole.Assistant,
        now,
      );

      const wire = JSON.stringify(result);
      for (const forbidden of [
        'commitment_score',
        'commitment_average',
        'submission_rate',
        'at_risk',
        'at_risk_count',
        'attendance_rate',
        'repetition_quality',
        'days_since_last_report',
      ]) {
        expect(wire).not.toContain(forbidden);
      }
    });

    /**
     * DEC-B09 at COMPILE time — the acceptance criterion's "never includes
     * performance data at the type level, not just by convention".
     *
     * Each `@ts-expect-error` below is itself the assertion: TypeScript
     * fails the build if the error it expects does NOT occur, so if anyone
     * ever widens `AssistantDashboardDto` to admit a performance field, this
     * file stops compiling and `npm run type-check` / `npm test` go red.
     * `?: never` is what makes that true structurally — not excess-property
     * checking, which a non-literal assignment would slip past.
     */
    it('cannot be typed to carry performance data (DEC-B09, compile-time)', () => {
      const groups: AssistantGroupDto[] = [
        { id: 'group-a', name: 'مجموعة أ', payment_followup_count: 3 },
      ];
      const valid: AssistantDashboardDto = {
        pending_request_count: 7,
        groups,
      };
      expect(valid.groups).toHaveLength(1);

      const scoreFromElsewhere: number = 78.4;
      const rateFromElsewhere: number | null = 0.9;

      const withScore: AssistantDashboardDto = {
        pending_request_count: 7,
        groups: [],
        // @ts-expect-error DEC-B09 — an Assistant payload cannot carry a commitment score.
        commitment_score: scoreFromElsewhere,
      };

      const withAverage: AssistantDashboardDto = {
        pending_request_count: 7,
        groups: [],
        // @ts-expect-error DEC-B09 — nor a group commitment average.
        commitment_average: scoreFromElsewhere,
      };

      const withAtRisk: AssistantDashboardDto = {
        pending_request_count: 7,
        groups: [],
        // @ts-expect-error DEC-B09 — nor an at-risk count.
        at_risk_count: 2,
      };

      const withRate: AssistantDashboardDto = {
        pending_request_count: 7,
        groups: [],
        // @ts-expect-error DEC-B09 — nor a submission rate.
        submission_rate: rateFromElsewhere,
      };

      const groupWithScore: AssistantGroupDto = {
        id: 'group-a',
        name: 'مجموعة أ',
        payment_followup_count: 0,
        // @ts-expect-error DEC-B09 — nor may a per-group row carry one.
        commitment_average: scoreFromElsewhere,
      };

      // The four objects above exist only to be type-checked; asserting on
      // them keeps `noUnusedLocals`-style lint rules honest.
      expect([
        withScore,
        withAverage,
        withAtRisk,
        withRate,
        groupWithScore,
      ]).toHaveLength(5);
    });
  });

  // ── Teacher (SCR-22) ─────────────────────────────────────────────────────

  describe('Teacher', () => {
    it('composes one card per assigned group from API-038 and API-040', async () => {
      listGroups.execute.mockResolvedValue({
        data: [
          { id: 'group-a', name: 'مجموعة أ' },
          { id: 'group-b', name: 'مجموعة ب' },
        ],
      } as never);
      groupPerformance.execute
        .mockResolvedValueOnce({
          data: { commitment_average: 72.5, submission_rate: 0.83 },
        } as never)
        .mockResolvedValueOnce({
          data: { commitment_average: null, submission_rate: null },
        } as never);
      atRisk.execute
        .mockResolvedValueOnce({ data: [{}, {}] } as never)
        .mockResolvedValueOnce({ data: [] });

      const result = await useCase.execute('teacher-1', UserRole.Teacher, now);

      expect(result.data).toEqual({
        groups: [
          {
            id: 'group-a',
            name: 'مجموعة أ',
            commitment_average: 72.5,
            at_risk_count: 2,
            submission_rate: 0.83,
          },
          {
            id: 'group-b',
            name: 'مجموعة ب',
            commitment_average: null,
            at_risk_count: 0,
            submission_rate: null,
          },
        ],
      });
      expect(groupPerformance.execute).toHaveBeenCalledWith(
        'teacher-1',
        'group-a',
        {},
        now,
      );
      expect(atRisk.execute).toHaveBeenCalledWith('teacher-1', 'group-a', now);
    });

    it('returns an empty group list for an unassigned Teacher (UF §10, no CTA)', async () => {
      listGroups.execute.mockResolvedValue({ data: [] });

      const result = await useCase.execute('teacher-1', UserRole.Teacher, now);

      expect((result.data as TeacherDashboardDto).groups).toEqual([]);
      expect(groupPerformance.execute).not.toHaveBeenCalled();
      expect(atRisk.execute).not.toHaveBeenCalled();
    });
  });

  // ── Admin (SCR-26) ───────────────────────────────────────────────────────

  describe('Admin', () => {
    it('returns exactly four counts, staff being Teacher + Assistant', async () => {
      groupRepository.countAll.mockResolvedValue(4);
      userRepository.countByRole.mockResolvedValue({
        [UserRole.Admin]: 1,
        [UserRole.Teacher]: 3,
        [UserRole.Assistant]: 2,
        [UserRole.Student]: 32,
        [UserRole.User]: 9,
      });
      membershipRepository.countByState.mockResolvedValue(6);

      const result = await useCase.execute('admin-1', UserRole.Admin, now);

      expect(result).toEqual({
        data: {
          group_count: 4,
          staff_count: 5,
          student_count: 32,
          pending_recovery_count: 6,
        },
      });
      expect(membershipRepository.countByState).toHaveBeenCalledWith(
        'Terminated',
      );
    });

    it('reads a role with no accounts as a genuine zero', async () => {
      groupRepository.countAll.mockResolvedValue(0);
      userRepository.countByRole.mockResolvedValue({ [UserRole.Admin]: 1 });
      membershipRepository.countByState.mockResolvedValue(0);

      const result = await useCase.execute('admin-1', UserRole.Admin, now);

      expect(result.data).toEqual({
        group_count: 0,
        staff_count: 0,
        student_count: 0,
        pending_recovery_count: 0,
      });
    });
  });

  // ── The union itself ─────────────────────────────────────────────────────

  it('carries no `type` discriminant on the wire — the role is the session (APIS §10.3)', async () => {
    joinRequestRepository.findLatestForUser.mockResolvedValue(null);

    const result = await useCase.execute('user-1', UserRole.User, now);

    expect(result.data).not.toHaveProperty('type');
    expect(JSON.stringify(result)).not.toContain('"type"');
  });
});
