import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY,
  type INotificationDispatchContextRepository,
  type LiveDeviceToken,
} from '../../domain/notification-dispatch-context.repository.interface';
import type { NotificationEventType } from '../../domain/notification-event';
import {
  NOTIFICATION_LOG_REPOSITORY,
  type INotificationLogRepository,
} from '../../domain/notification-log.repository.interface';
import type { NotificationOutcome } from '../../domain/notification-log.entity';
import {
  evaluateMembershipSuppression,
  type SuppressionReason,
} from '../../domain/notification-suppression';
import { buildPushPayload } from '../../domain/push-payload';
import {
  PUSH_SENDER,
  type IPushSender,
  type PushSendResult,
} from '../../domain/push-sender.interface';

/**
 * SA §21's first parameter: the occurrence being notified about. `type` is
 * the SAS §22.2 id, `resourceId` is the ONE identifier BR-46 lets the
 * payload carry, and `recheckMembershipId` names the membership whose
 * §22.3 membership-context conditions must be re-read before sending —
 * supplied by N-01, the event §22.3's rule set is written for.
 */
export interface NotificationEvent {
  type: NotificationEventType;
  resourceId: string;
  recheckMembershipId?: string;
}

/** SA §21's second parameter: the resolved recipient (SAS §22.1). */
export interface NotificationRecipient {
  userId: string;
}

export interface DispatchResult {
  outcome: NotificationOutcome;
  /** Set when `outcome` is `Suppressed`; the §22.3 condition that held. */
  reason: SuppressionReason | null;
  transportReference: string | null;
}

/**
 * `NotificationService.dispatch(event, recipient, category)` — the single
 * path all eight SAS §22.2 events take (ADR-009, SAS §3706: "eight event
 * types with differing suppression rules, muting rules and recipients need
 * ONE place to enforce BR-46, BR-60 and BR-61").
 *
 * It walks SA §21's sequence in order, and nothing else does:
 *
 * 1. **Check preferences**, skipping the check entirely for an
 *    account-critical category — `notification_categories.is_mutable =
 *    false` (BR-61, FR-NOTIF-06) makes N-03/N-04/N-08 unsuppressible by
 *    mute, and the decision is read from the DBT-15 row, never from a
 *    hard-coded list. Muted → log `Suppressed`, stop.
 * 2. **Re-check the §22.3 suppression conditions** against a fresh read:
 *    the four membership-context conditions when the event names a
 *    membership to re-check, then "no valid device token exists", which is
 *    universal (UC-15 E1 — no token, skip, log, never block).
 * 3. **Build the payload** — `buildPushPayload`, two fields, frozen (BR-46).
 * 4. **Send**, retrying ONCE on a transient transport failure and NEVER on
 *    an invalid token, which is instead marked `invalidated_at` (SAS §22.5,
 *    UC-15 E2).
 * 5. **Log the outcome** to `notification_log` — `Sent`, `Failed` or
 *    `Suppressed`, always exactly one row (FR-NOTIF-08).
 *
 * It never throws (BR-60, ADR-032, AGENTS §8 "notification degradation"):
 * every failure — transport, provider, even the log write — is caught and
 * reported as an outcome, so an FCM or Mailgun outage can never surface on
 * the request that triggered the event. Callers are listeners and scheduler
 * ticks; neither has a caller to propagate to.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_DISPATCH_CONTEXT_REPOSITORY)
    private readonly context: INotificationDispatchContextRepository,
    @Inject(NOTIFICATION_LOG_REPOSITORY)
    private readonly log: INotificationLogRepository,
    @Inject(PUSH_SENDER)
    private readonly sender: IPushSender,
  ) {}

  async dispatch(
    event: NotificationEvent,
    recipient: NotificationRecipient,
    category: NotificationEventType,
    now: Date = new Date(),
  ): Promise<DispatchResult> {
    try {
      return await this.run(event, recipient, category, now);
    } catch (err: unknown) {
      // BR-60 / ADR-032: best-effort. Nothing about a dispatch may escape.
      this.logger.error(
        `Notification ${category} to user ${recipient.userId} aborted: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err instanceof Error ? err.stack : undefined,
      );
      // FR-NOTIF-08 still wants the outcome on record. The log write is
      // itself best-effort — it may be the thing that just failed.
      try {
        await this.record(recipient.userId, category, 'Failed', null, now);
      } catch {
        // Nothing left to do: the diagnosis is the ERROR line above.
      }
      return { outcome: 'Failed', reason: null, transportReference: null };
    }
  }

  private async run(
    event: NotificationEvent,
    recipient: NotificationRecipient,
    category: NotificationEventType,
    now: Date,
  ): Promise<DispatchResult> {
    // 1. Preferences — skipped entirely when the category is not mutable.
    const preference = await this.context.findPreference(
      recipient.userId,
      category,
    );
    if (preference === null) {
      this.logger.error(
        `Notification ${category} to user ${recipient.userId} aborted: no notification_categories row for that code`,
      );
      return { outcome: 'Failed', reason: null, transportReference: null };
    }
    if (preference.isMutable && preference.muted) {
      return this.suppress(recipient.userId, category, 'CATEGORY_MUTED', now);
    }

    // 2. Re-check §22.3. The membership-context half applies to the events
    //    that name a membership; the token half applies to every event.
    if (event.recheckMembershipId !== undefined) {
      const membership = await this.context.findMembershipSuppressionContext(
        event.recheckMembershipId,
        now,
      );
      if (membership === null) {
        return this.suppress(
          recipient.userId,
          category,
          'MEMBERSHIP_NOT_ACTIVE',
          now,
        );
      }
      const reason = evaluateMembershipSuppression(membership);
      if (reason !== null) {
        return this.suppress(recipient.userId, category, reason, now);
      }
    }

    const tokens = await this.context.findLiveDeviceTokens(recipient.userId);
    if (tokens.length === 0) {
      return this.suppress(recipient.userId, category, 'NO_DEVICE_TOKEN', now);
    }

    // 3. Build the payload — BR-46's two fields, and nothing else.
    const payload = buildPushPayload({
      eventType: event.type,
      resourceId: event.resourceId,
    });

    // 4. Send to every live token of the recipient; one push per device.
    let transportReference: string | null = null;
    let anySent = false;
    for (const device of tokens) {
      const result = await this.sendToDevice(device, payload);
      if (result.status === 'sent') {
        anySent = true;
        transportReference ??= result.transportReference;
      }
    }

    // 5. Log the outcome (FR-NOTIF-08).
    const outcome: NotificationOutcome = anySent ? 'Sent' : 'Failed';
    await this.record(
      recipient.userId,
      category,
      outcome,
      transportReference,
      now,
    );
    this.logger.log(
      `Notification ${category} to user ${recipient.userId} for resource ${event.resourceId}: ${outcome}`,
    );
    return { outcome, reason: null, transportReference };
  }

  /**
   * SAS §22.5: "at most one retry on transient transport failure; never on
   * invalid-token errors". A rejected token is invalidated (E-09) and not
   * retried — the row is dead, a second attempt cannot change that.
   */
  private async sendToDevice(
    device: LiveDeviceToken,
    payload: ReturnType<typeof buildPushPayload>,
  ): Promise<PushSendResult> {
    let result = await this.sender.send(device.token, payload);

    if (result.status === 'transient-failure') {
      this.logger.warn(
        `Push transport failed transiently for device ${device.id}, retrying once: ${
          result.detail ?? 'no detail'
        }`,
      );
      result = await this.sender.send(device.token, payload);
    }

    if (result.status === 'invalid-token') {
      this.logger.warn(
        `Push token for device ${device.id} rejected as invalid, marking invalidated_at (E-09)`,
      );
      await this.context.invalidateDeviceToken(device.id);
    }

    return result;
  }

  private async suppress(
    userId: string,
    category: NotificationEventType,
    reason: SuppressionReason,
    now: Date,
  ): Promise<DispatchResult> {
    await this.record(userId, category, 'Suppressed', null, now);
    this.logger.log(
      `Notification ${category} to user ${userId}: Suppressed (${reason})`,
    );
    return { outcome: 'Suppressed', reason, transportReference: null };
  }

  private async record(
    userId: string,
    category: NotificationEventType,
    outcome: NotificationOutcome,
    transportReference: string | null,
    now: Date,
  ): Promise<void> {
    await this.log.record({
      userId,
      category,
      outcome,
      transportReference,
      dispatchedAt: now,
    });
  }
}
