import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { JoinRequestAcceptedEvent } from '../../../enrollment/domain/events/join-request-accepted.event';
import { JoinRequestRejectedEvent } from '../../../enrollment/domain/events/join-request-rejected.event';
import { JoinRequestSubmittedEvent } from '../../../enrollment/domain/events/join-request-submitted.event';
import {
  NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY,
  type INotificationDispatchContextRepository,
} from '../../domain/notification-dispatch-context.repository.interface';
import { NotificationService } from '../dispatch/notification.service';

/**
 * The three Enrollment-produced notifications of SAS §22.2, wired onto the
 * events F-ENR-01/05/06 already emit (DE-01, DE-02, DE-04 — the dashed
 * `Enrollment -.DE-01/02/04.-> Notifications` edge of SA §11):
 *
 * - **N-05** new join request received → the Assistant of the target group,
 *   mutable. The slot has existed since F-ENR-01, whose emit site is
 *   commented "for future Notification listeners"; this is that listener.
 * - **N-03** join request accepted → the Applicant, account-critical. The
 *   slot has existed since F-ENR-05.
 * - **N-04** join request rejected → the Applicant, account-critical. NEW —
 *   it was missed when F-ENR-06 was scoped in EPIC-03. `DE-04`'s producers
 *   are "Assistant rejects, or Group archived" (DMS §17); this listener is
 *   the hook for both, and picks up the archival path automatically once
 *   DS-07's auto-rejection emits the same event (that emit belongs to the
 *   Groups module and is deliberately not added here).
 *
 * Every handler is fire-and-forget with its own try/catch (ADR-032): the
 * emitting use case never awaits it, and `NotificationService` never
 * throws, so neither an FCM outage nor a missing recipient can reach the
 * `POST /join-requests` or `PATCH /join-requests/{id}` response (AGENTS §8).
 * Each returns its promise so a test can await the same work the emitter
 * deliberately does not.
 */
@Injectable()
export class EnrollmentNotificationListener {
  private readonly logger = new Logger(EnrollmentNotificationListener.name);

  constructor(
    private readonly notifications: NotificationService,
    @Inject(NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY)
    private readonly context: INotificationDispatchContextRepository,
  ) {}

  /** N-05 — recipient is resolved from the group, not carried by DE-01. */
  @OnEvent(JoinRequestSubmittedEvent.EVENT_NAME)
  async onJoinRequestSubmitted(
    event: JoinRequestSubmittedEvent,
  ): Promise<void> {
    try {
      const assistantUserId = await this.context.findGroupAssistantUserId(
        event.groupId,
      );
      if (assistantUserId === null) {
        this.logger.warn(
          `N-05 skipped for join request ${event.joinRequestId}: group ${event.groupId} has no resolvable assistant`,
        );
        return;
      }
      await this.notifications.dispatch(
        { type: 'N-05', resourceId: event.joinRequestId },
        { userId: assistantUserId },
        'N-05',
      );
    } catch (err: unknown) {
      this.logger.error(
        `N-05 listener failed for join request ${event.joinRequestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** N-03 — the accepted applicant, addressed at the new Membership. */
  @OnEvent(JoinRequestAcceptedEvent.EVENT_NAME)
  async onJoinRequestAccepted(event: JoinRequestAcceptedEvent): Promise<void> {
    try {
      await this.notifications.dispatch(
        { type: 'N-03', resourceId: event.membershipId },
        { userId: event.applicantUserId },
        'N-03',
      );
    } catch (err: unknown) {
      this.logger.error(
        `N-03 listener failed for join request ${event.joinRequestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** N-04 — the rejected applicant, addressed at the JoinRequest itself. */
  @OnEvent(JoinRequestRejectedEvent.EVENT_NAME)
  async onJoinRequestRejected(event: JoinRequestRejectedEvent): Promise<void> {
    try {
      await this.notifications.dispatch(
        { type: 'N-04', resourceId: event.joinRequestId },
        { userId: event.applicantUserId },
        'N-04',
      );
    } catch (err: unknown) {
      this.logger.error(
        `N-04 listener failed for join request ${event.joinRequestId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
