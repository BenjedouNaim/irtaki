import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MembershipTerminatedEvent } from '../../../memberships/domain/events/membership-terminated.event';
import {
  NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY,
  type INotificationDispatchContextRepository,
} from '../../domain/notification-dispatch-context.repository.interface';
import { NotificationService } from '../dispatch/notification.service';

/**
 * **N-08** removed from group → the Student, account-critical (SAS §22.2),
 * on DE-09 `MembershipTerminated` — the `Memberships -.DE-09.->
 * Notifications` edge of SA §11. The slot has existed since F-MEM-03; this
 * connects it.
 *
 * DE-09 carries `membership_id`, `ended_by` and `ended_at` and nothing else
 * (DMS §17), so the recipient is resolved here by this module's own
 * one-row read — the terminated `memberships` row survives termination
 * (only its reports/payments are soft-deleted), so the lookup is always
 * answerable.
 *
 * Account-critical means `notification_categories.is_mutable = false`, so
 * `dispatch` skips the preference check outright: a Student cannot mute
 * being told they were removed (BR-61, FR-NOTIF-06).
 */
@Injectable()
export class MembershipNotificationListener {
  private readonly logger = new Logger(MembershipNotificationListener.name);

  constructor(
    private readonly notifications: NotificationService,
    @Inject(NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY)
    private readonly context: INotificationDispatchContextRepository,
  ) {}

  @OnEvent(MembershipTerminatedEvent.EVENT_NAME)
  async onMembershipTerminated(
    event: MembershipTerminatedEvent,
  ): Promise<void> {
    try {
      const userId = await this.context.findMembershipHolderUserId(
        event.membershipId,
      );
      if (userId === null) {
        this.logger.warn(
          `N-08 skipped: membership ${event.membershipId} has no resolvable holder`,
        );
        return;
      }
      await this.notifications.dispatch(
        { type: 'N-08', resourceId: event.membershipId },
        { userId },
        'N-08',
      );
    } catch (err: unknown) {
      this.logger.error(
        `N-08 listener failed for membership ${event.membershipId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
