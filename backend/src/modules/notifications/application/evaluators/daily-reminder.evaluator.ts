import { Inject, Injectable } from '@nestjs/common';
import {
  isWithinLocalWindow,
  localDateInTimezone,
} from '../../../reports/domain/local-date';
import {
  NOTIFICATION_EVALUATION_REPOSITORY,
  type INotificationEvaluationRepository,
} from '../../domain/notification-evaluation.repository.interface';
import { NotificationService } from '../dispatch/notification.service';
import type { EvaluationOutcome } from './evaluation-outcome';

/** FR-NOTIF-02 / SAS §19.4: "20:00 in each user's local timezone". */
export const DAILY_REMINDER_LOCAL_MINUTES = 20 * 60;

/**
 * **N-01** daily report not yet submitted → the Student, mutable (UC-15).
 *
 * ADR-030 in one place: the tick is timezone-less, and each candidate row
 * is asked whether ITS OWN local clock — `users.timezone`, T-01/INV-27,
 * never `CENTER_TIMEZONE` and never the server's — has just entered the
 * 20:00 bucket. A student in `Africa/Tunis` and a student in
 * `Pacific/Auckland` are therefore reminded eleven hours apart, each at
 * their own 20:00, off the same tick.
 *
 * The trigger is "on an expected day only", and every one of §22.3's six
 * suppression conditions is then re-checked inside `dispatch` against a
 * fresh read (SA §21) — this evaluator deliberately re-checks none of them
 * itself, so the rule has exactly one implementation. Passing
 * `recheckMembershipId` is what arms the four membership-context
 * conditions; the mute and device-token conditions are unconditional.
 */
@Injectable()
export class DailyReminderEvaluator {
  constructor(
    @Inject(NOTIFICATION_EVALUATION_REPOSITORY)
    private readonly repository: INotificationEvaluationRepository,
    private readonly notifications: NotificationService,
  ) {}

  async evaluate(now: Date, windowMinutes: number): Promise<EvaluationOutcome> {
    const candidates = await this.repository.findReminderCandidates();
    let triggered = 0;
    let sent = 0;

    for (const candidate of candidates) {
      if (
        !isWithinLocalWindow(
          now,
          candidate.timezone,
          DAILY_REMINDER_LOCAL_MINUTES,
          windowMinutes,
        )
      ) {
        continue;
      }

      triggered += 1;
      const result = await this.notifications.dispatch(
        {
          type: 'N-01',
          resourceId: candidate.membershipId,
          recheckMembershipId: candidate.membershipId,
        },
        { userId: candidate.userId },
        'N-01',
        now,
      );
      if (result.outcome === 'Sent') {
        sent += 1;
      }
    }

    return { candidates: candidates.length, triggered, sent };
  }

  /** Exposed for the fixture tests: the student-local date this run sees. */
  static localToday(now: Date, timezone: string): string {
    return localDateInTimezone(now, timezone);
  }
}
