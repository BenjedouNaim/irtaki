import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  GROUP_PAYMENT_SCOPE,
  type IGroupPaymentScope,
} from '../../domain/group-payment-scope.interface';
import { PaymentCycleStatus } from '../../domain/payment-cycle';
import { DerivedPaymentLedger } from '../../domain/payment-cycle-derivation.service';
import {
  MembershipPaidCycleRecord,
  PAYMENT_REPOSITORY,
  PaidCycleRecord,
  type IPaymentRepository,
} from '../../domain/payment.repository.interface';
import { deriveLedgerForMembership } from '../derive-ledger';
import { toGroupStudentLedgerDto } from '../payment-ledger.mapper';
import { GetGroupPaymentLedgerResponseDto } from './get-group-payment-ledger-response.dto';

export interface GetGroupPaymentLedgerQuery {
  /** APIS §9.3 `status` filter; absent = the "All" chip (UF §18). */
  status?: PaymentCycleStatus;
}

/**
 * F-PAY-02 / API-046 `GET /groups/{id}/payments?status=` — Assistant
 * (assigned group) and Admin (all) read "the same per-student ledgers for a
 * group" (APIS §10.11, FR-PAY-06, UC-09 steps 1–5, UF §18).
 *
 * **Teacher is absent from the route's `@Roles()`** so RolesGuard alone
 * yields the unconditional `403` SRS §10 and UC-09 ("Teacher: never")
 * require. This is the inverse of DEC-B09's Assistant exclusion on
 * Reports/Progress/Performance — the two must never be swapped.
 *
 * Scope is resolved BEFORE this use case by `GroupPaymentsScopeGuard`
 * (TS §15.2); the group id handed in is the one that passed it, and the
 * repository still scopes its own query on that id (SA §14's second layer).
 * An Admin bypasses the guard (DEC-C07), so a genuinely non-existent group
 * is established here — `404` (APIS §9.6), never a masked `403`, since an
 * Admin has no scope to mask.
 *
 * Nothing is written and nothing about a cycle is stored (ADR-006): every
 * figure comes from DS-06, per student, against that student's own
 * timezone (T-01, INV-27).
 */
@Injectable()
export class GetGroupPaymentLedgerUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly paymentRepository: IPaymentRepository,
    @Inject(GROUP_PAYMENT_SCOPE)
    private readonly groupPaymentScope: IGroupPaymentScope,
  ) {}

  async execute(
    groupId: string,
    query: GetGroupPaymentLedgerQuery = {},
    now: Date = new Date(),
  ): Promise<GetGroupPaymentLedgerResponseDto> {
    const contexts =
      await this.paymentRepository.findGroupLedgerContextsByGroupId(groupId);

    if (
      contexts.length === 0 &&
      !(await this.groupPaymentScope.groupExists(groupId))
    ) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    const paidByMembership = groupPaidCycles(
      await this.paymentRepository.findPaidCyclesByMembershipIds(
        contexts.map((context) => context.membershipId),
      ),
    );

    const ledgers = contexts.map((context) => ({
      context,
      ledger: deriveLedgerForMembership(
        context,
        paidByMembership.get(context.membershipId) ?? [],
        now,
      ),
    }));

    return {
      data: ledgers
        .filter(({ ledger }) => matchesStatus(ledger, query.status))
        .map(({ context, ledger }) => toGroupStudentLedgerDto(context, ledger)),
    };
  }
}

/** The paid rows of one group, grouped by the membership they belong to. */
function groupPaidCycles(
  rows: readonly MembershipPaidCycleRecord[],
): Map<string, PaidCycleRecord[]> {
  const byMembership = new Map<string, PaidCycleRecord[]>();
  for (const row of rows) {
    const bucket = byMembership.get(row.membershipId);
    const cycle: PaidCycleRecord = {
      cycleIndex: row.cycleIndex,
      paidAt: row.paidAt,
    };
    if (bucket) {
      bucket.push(cycle);
    } else {
      byMembership.set(row.membershipId, [cycle]);
    }
  }
  return byMembership;
}

/**
 * FR-PAY-06's filter selects **students**, not cycles: UF §18's row carries
 * one "current-cycle badge", the chips are that badge's three values, and
 * the filtered empty state reads "No students with this status". So a
 * student matches when their current cycle — the last DS-06 generated,
 * since generation runs up to today or the FR-PAY-12 stop — carries the
 * requested status. The matched student's ledger is returned whole; the
 * filter never trims anyone's cycle list.
 *
 * The filter cannot be a SQL predicate: no cycle is stored (ADR-006), so
 * the status exists only after DS-06 has run. This is a derived-value
 * filter over rows the repository already scoped, not a scope post-filter.
 */
function matchesStatus(
  ledger: DerivedPaymentLedger,
  status?: PaymentCycleStatus,
): boolean {
  if (!status) {
    return true;
  }
  const current = ledger.cycles[ledger.cycles.length - 1];
  return current !== undefined && current.status === status;
}
