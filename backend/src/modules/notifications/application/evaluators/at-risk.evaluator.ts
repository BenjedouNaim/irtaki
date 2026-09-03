import { Inject, Injectable } from '@nestjs/common';
import { AtRiskDetectionService } from '../../../performance/domain/at-risk-detection';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import { computeEffectiveWindow } from '../../../reports/domain/weekly-metrics-calculator';
import {
  NOTIFICATION_EVALUATION_REPOSITORY,
  type INotificationEvaluationRepository,
} from '../../domain/notification-evaluation.repository.interface';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/notification-log.repository.interface';
import { NotificationService } from '../dispatch/notification.service';
import { atRiskEpisodeWindowStart } from './cadence-window';
import type { EvaluationOutcome } from './evaluation-outcome';

/**
 * **N-07** student at risk → the Teacher of that group, mutable (SAS §22.2,
 * DE-13). The predicate is DS-04 `AtRiskDetectionService`, reused from the
 * Performance module's framework-free domain layer rather than restated —
 * the flag is never stored (DMS §22, ADR-004), so the scheduler evaluates
 * exactly what `GET /groups/{id}/at-risk` evaluates and the two can never
 * disagree. `EffectiveWindow(m)` and "today" are resolved in the STUDENT's
 * timezone (T-01, SAS §18.1), whoever the recipient is.
 *
 * ISS-17: **once per episode, not daily while the condition persists.** The
 * guard is a read of `notification_log` before dispatch, exactly as SA §21
 * specifies ("no new table needed") — has this Teacher any N-07 row since
 * this membership's episode began? A report breaks the streak, moves the
 * anchor and opens a new window, so a relapse notifies again.
 *
 * ⚠️ `notification_log` is keyed on the RECIPIENT (E-11 has no target
 * column), so two students of the same Teacher whose episodes overlap
 * produce one notification, not two — the documented mechanism cannot
 * distinguish them. Recorded rather than worked around, per AGENTS §14.
 */
@Injectable()
export class AtRiskEvaluator {
  constructor(
    @Inject(NOTIFICATION_EVALUATION_REPOSITORY)
    private readonly repository: INotificationEvaluationRepository,
    @Inject(NOTIFICATION_LOG_REPOSITORY)
    private readonly log: INotificationLogRepository,
    private readonly notifications: NotificationService,
  ) {}

  async evaluate(now: Date): Promise<EvaluationOutcome> {
    const candidates = await this.repository.findAtRiskCandidates();
    let triggered = 0;
    let sent = 0;

    for (const candidate of candidates) {
      const today = localDateInTimezone(now, candidate.timezone);
      const window = computeEffectiveWindow({
        startedAt: candidate.startedAt,
        today,
        endedAt: candidate.endedAt,
        archivedAt: candidate.archivedAt,
      });

      const evaluation = AtRiskDetectionService.evaluate({
        lastReportDate: candidate.lastReportDate,
        window,
        recitationDay: candidate.recitationDay,
      });
      if (!evaluation.atRisk) {
        continue;
      }

      const since = atRiskEpisodeWindowStart(
        candidate.lastReportDate,
        candidate.startedAt,
      );
      if (
        await this.log.hasEntrySince(candidate.teacherUserId, 'N-07', since)
      ) {
        continue;
      }

      triggered += 1;
      const result = await this.notifications.dispatch(
        { type: 'N-07', resourceId: candidate.membershipId },
        { userId: candidate.teacherUserId },
        'N-07',
        now,
      );
      if (result.outcome === 'Sent') {
        sent += 1;
      }
    }

    return { candidates: candidates.length, triggered, sent };
  }
}
