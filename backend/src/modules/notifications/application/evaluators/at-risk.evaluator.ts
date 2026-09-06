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
 * cadence is specified twice and neither wording is per-recipient — SAS
 * §22.3: "N-07 should be sent **once** per at-risk episode, not daily while
 * the condition persists", and SA.md:521: "Cadence (ISS-17): N-06/N-07 fire
 * once per cycle/episode — checked against existing `notification_log`
 * entries before dispatch, no new table needed". An episode is a property of
 * a STUDENT (DS-04 evaluates one membership's streak), so "once per episode"
 * is once per student, and the guard is a read of `notification_log` before
 * dispatch exactly as SA §21 prescribes — no new table, no stored flag. A
 * report breaks the streak, moves the anchor and opens a new window, so a
 * relapse notifies again.
 *
 * ISS #135 narrows that read from (recipient, category) to (recipient,
 * category, SUBJECT), the subject being the at-risk student's membership.
 * Before `notification_log.subject_id` existed, E-11 recorded only who was
 * told, so a Teacher with two at-risk students in one window was told about
 * one of them and the guard swallowed the other — the dedup was correct
 * given the data, and the data was the defect. The once-per-episode
 * guarantee is unchanged in strength; it now holds PER STUDENT, which is
 * what "per episode" meant all along.
 *
 * N-06 keeps the unnarrowed `hasEntrySince`: its recipient IS its subject
 * (DB-UQ-02 allows one `Active` membership per user), so recipient-level
 * dedup is already exact there and issue #135 requires it unchanged.
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
        await this.log.hasEntryForSubjectSince(
          candidate.teacherUserId,
          'N-07',
          candidate.membershipId,
          since,
        )
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
