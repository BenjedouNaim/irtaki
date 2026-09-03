import { Inject, Injectable } from '@nestjs/common';
import {
  isoDayOfWeek,
  isWithinLocalWindow,
  localDateInTimezone,
} from '../../../reports/domain/local-date';
import {
  NOTIFICATION_EVALUATION_REPOSITORY,
  type INotificationEvaluationRepository,
} from '../../domain/notification-evaluation.repository.interface';
import { NotificationService } from '../dispatch/notification.service';
import type { EvaluationOutcome } from './evaluation-outcome';

/** SAS §22.2 N-02: "start of the group's recitation day, student-local". */
export const WEEKLY_REPORT_AVAILABLE_LOCAL_MINUTES = 0;

/**
 * **N-02** weekly report available → the Student, mutable (SAS §22.2).
 *
 * The trigger is the start of the group's recitation day in the STUDENT's
 * timezone — the same instant DBD §14 has the E-06 row come into existence
 * ("created on entering the recitation day, or lazily on first read that
 * day"), and one local day before `WeeklyReportFinalizationJob` defaults
 * the same week (FR-WR-06). Two conditions, both per row: the local clock
 * is in the midnight bucket, and the local date's ISO day-of-week is the
 * group's `recitation_day`.
 *
 * §22.3's membership-context conditions are N-01's rule set and are NOT
 * applied here — SAS scopes them to N-01 by name. The candidate query
 * already restricts to `Active` memberships of `Active` groups, and the
 * mute and device-token conditions of SA §21's own sequence still apply
 * inside `dispatch`.
 */
@Injectable()
export class WeeklyReportAvailableEvaluator {
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
          WEEKLY_REPORT_AVAILABLE_LOCAL_MINUTES,
          windowMinutes,
        )
      ) {
        continue;
      }
      const localToday = localDateInTimezone(now, candidate.timezone);
      if (isoDayOfWeek(localToday) !== candidate.recitationDay) {
        continue;
      }

      triggered += 1;
      const result = await this.notifications.dispatch(
        { type: 'N-02', resourceId: candidate.membershipId },
        { userId: candidate.userId },
        'N-02',
        now,
      );
      if (result.outcome === 'Sent') {
        sent += 1;
      }
    }

    return { candidates: candidates.length, triggered, sent };
  }
}
