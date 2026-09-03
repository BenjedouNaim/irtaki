import { Inject, Injectable } from '@nestjs/common';
import { PaymentCycleDerivationService } from '../../../payments/domain/payment-cycle-derivation.service';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import {
  NOTIFICATION_EVALUATION_REPOSITORY,
  type INotificationEvaluationRepository,
} from '../../domain/notification-evaluation.repository.interface';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/notification-log.repository.interface';
import { NotificationService } from '../dispatch/notification.service';
import { utcInstantOfDate } from './cadence-window';
import type { EvaluationOutcome } from './evaluation-outcome';

/**
 * **N-06** payment due soon → the Student, mutable (SAS §22.2, DE-14):
 * "cycle enters its final 10 days (BR-33)".
 *
 * The condition is not restated here — DS-06
 * `PaymentCycleDerivationService` already derives `Due Soon` from
 * `memberships.started_at`, today in the student's timezone and the live
 * `payment_records` rows (ADR-006: nothing about a cycle is stored), and
 * BR-55 already confines `Due Soon` to the CURRENT cycle so an older
 * unpaid one stays `Unpaid` and does not re-trigger. The evaluator only
 * asks the ledger which cycle, if any, is `Due Soon`.
 *
 * ISS-17: **once per cycle, not daily for ten days.** The guard is a read
 * of `notification_log` before dispatch (SA §21, "no new table needed"):
 * has this Student any N-06 row since the current cycle began? Cycles are
 * three months long and never overlap, and the recipient is the student
 * the cycle belongs to, so the guard is exact.
 */
@Injectable()
export class PaymentDueSoonEvaluator {
  constructor(
    @Inject(NOTIFICATION_EVALUATION_REPOSITORY)
    private readonly repository: INotificationEvaluationRepository,
    @Inject(NOTIFICATION_LOG_REPOSITORY)
    private readonly log: INotificationLogRepository,
    private readonly notifications: NotificationService,
  ) {}

  async evaluate(now: Date): Promise<EvaluationOutcome> {
    const candidates = await this.repository.findPaymentCandidates();
    let triggered = 0;
    let sent = 0;

    for (const candidate of candidates) {
      const today = localDateInTimezone(now, candidate.timezone);
      const ledger = PaymentCycleDerivationService.derive({
        startedAt: candidate.startedAt,
        today,
        endedAt: candidate.endedAt,
        archivedAt: candidate.archivedAt,
        paidCycles: candidate.paidCycles,
      });

      const dueSoon = ledger.cycles.find(
        (cycle) => cycle.status === 'Due Soon',
      );
      if (dueSoon === undefined) {
        continue;
      }

      const since = utcInstantOfDate(dueSoon.startDate);
      if (await this.log.hasEntrySince(candidate.userId, 'N-06', since)) {
        continue;
      }

      triggered += 1;
      const result = await this.notifications.dispatch(
        { type: 'N-06', resourceId: candidate.membershipId },
        { userId: candidate.userId },
        'N-06',
        now,
      );
      if (result.outcome === 'Sent') {
        sent += 1;
      }
    }

    return { candidates: candidates.length, triggered, sent };
  }
}
