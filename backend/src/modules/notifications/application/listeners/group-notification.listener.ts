import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GroupArchivedEvent } from '../../../groups/domain/events/group-archived.event';
import {
  NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY,
  type INotificationDispatchContextRepository,
} from '../../domain/notification-dispatch-context.repository.interface';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/notification-log.repository.interface';
import { NotificationService } from '../dispatch/notification.service';

/**
 * **N-04** join request rejected → the Applicant, account-critical (SAS
 * §22.2), on the SECOND of DE-04's two producers: "Assistant rejects, or
 * auto-rejection on archival (UC-13)". `EnrollmentNotificationListener`
 * already covers the first; this covers the second, over DE-10
 * `GroupArchivedEvent` — the `Groups -.DE-10.-> Notifications` edge of
 * SA §11.
 *
 * The rejection itself is NOT performed here and never was: DS-07 / EC-10 /
 * FR-REQ-08 make it part of the archival transaction
 * (`GroupRepository.archiveWithPendingRejection`), where a guarded
 * `UPDATE … WHERE status = 'Pending'` decides it once (TS §20) and stamps
 * `resolution_source = 'system'` with `reviewed_by` left NULL, because no
 * user performed it (DMS DS-07, and `join_requests.reviewed_by` is nullable
 * precisely so this case can be represented). By the time DE-10 is emitted
 * the transition is already durable; this listener only tells the people it
 * happened to, which is exactly what issue #133 found missing — an applicant
 * was never informed their application had ended.
 *
 * **Duplicate delivery.** DE-10 carries the ids the cascade rejected, so a
 * second delivery of the same event would otherwise notify every applicant
 * twice. The guard is SA §21's own mechanism — "checked against existing
 * `notification_log` entries before dispatch, no new table needed" — read
 * per (recipient, subject) now that ISS #135 gave `notification_log` a
 * `subject_id`: has this Applicant any N-04 row about THIS JoinRequest since
 * the group was archived? A rejection is terminal and a JoinRequest is
 * rejected once, so the question has one true answer for all time and the
 * guard cannot suppress a later, legitimate N-04. Any outcome counts, on
 * `hasEntryForSubjectSince`'s documented rule: a `Suppressed` or `Failed`
 * row is a decision, and BR-60 makes a non-delivery no reason to retry.
 *
 * **N-04 is account-critical** — `notification_categories.is_mutable =
 * false` (BR-61, FR-NOTIF-06) — so it goes through the ONE
 * `NotificationService.dispatch` path, which skips the preference check
 * outright for a non-mutable category. Nothing here consults a preference
 * or a hard-coded list; muting cannot reach it, exactly as on the manual
 * rejection path.
 *
 * Failure mode is the other listeners' (ADR-032, AGENTS §8): one try/catch
 * around the whole handler, nothing rethrown, and `dispatch` itself never
 * throws — so neither an FCM outage nor an unresolvable applicant can reach
 * the `PATCH /groups/{id}/lifecycle` response. The emitter does not await
 * this; the returned promise exists so a test can await the same work.
 */
@Injectable()
export class GroupNotificationListener {
  private readonly logger = new Logger(GroupNotificationListener.name);

  constructor(
    private readonly notifications: NotificationService,
    @Inject(NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY)
    private readonly context: INotificationDispatchContextRepository,
    @Inject(NOTIFICATION_LOG_REPOSITORY)
    private readonly log: INotificationLogRepository,
  ) {}

  /** N-04 fanned out to every applicant DS-07 auto-rejected (DE-10 → DE-04). */
  @OnEvent(GroupArchivedEvent.EVENT_NAME)
  async onGroupArchived(event: GroupArchivedEvent): Promise<void> {
    try {
      // Resolved through this module's OWN infrastructure — SA §11 makes
      // Notifications a subscriber with no inbound edge, so it may not
      // inject Enrollment's repository to answer "whose request was this".
      const applicants = await this.context.findJoinRequestApplicants(
        event.autoRejectedJoinRequestIds,
      );

      const unresolved =
        event.autoRejectedJoinRequestIds.length - applicants.length;
      if (unresolved > 0) {
        this.logger.warn(
          `N-04 skipped for ${unresolved} of ${event.autoRejectedJoinRequestIds.length} auto-rejected requests of group ${event.groupId}: no resolvable applicant`,
        );
      }

      for (const applicant of applicants) {
        if (
          await this.log.hasEntryForSubjectSince(
            applicant.userId,
            'N-04',
            applicant.joinRequestId,
            event.archivedAt,
          )
        ) {
          continue;
        }
        await this.notifications.dispatch(
          { type: 'N-04', resourceId: applicant.joinRequestId },
          { userId: applicant.userId },
          'N-04',
        );
      }
    } catch (err: unknown) {
      this.logger.error(
        `N-04 listener failed for archived group ${event.groupId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
