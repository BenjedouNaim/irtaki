/* eslint-disable @typescript-eslint/unbound-method */
import { JoinRequestAcceptedEvent } from '../../../enrollment/domain/events/join-request-accepted.event';
import { JoinRequestRejectedEvent } from '../../../enrollment/domain/events/join-request-rejected.event';
import { JoinRequestSubmittedEvent } from '../../../enrollment/domain/events/join-request-submitted.event';
import type { INotificationDispatchContextRepository } from '../../domain/notification-dispatch-context.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { EnrollmentNotificationListener } from './enrollment-notification.listener';

describe('EnrollmentNotificationListener — N-03 / N-04 / N-05', () => {
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let context: jest.Mocked<INotificationDispatchContextRepository>;
  let listener: EnrollmentNotificationListener;

  beforeEach(() => {
    notifications = {
      dispatch: jest.fn().mockResolvedValue({
        outcome: 'Sent',
        reason: null,
        transportReference: 'ticket-1',
      }),
    };
    context = {
      findLiveDeviceTokens: jest.fn(),
      invalidateDeviceToken: jest.fn(),
      findPreference: jest.fn(),
      findMembershipSuppressionContext: jest.fn(),
      findMembershipHolderUserId: jest.fn(),
      findGroupAssistantUserId: jest.fn().mockResolvedValue('assistant-1'),
    };
    listener = new EnrollmentNotificationListener(
      notifications as unknown as NotificationService,
      context,
    );
  });

  it('N-05: notifies the Assistant of the target group on DE-01', async () => {
    await listener.onJoinRequestSubmitted(
      new JoinRequestSubmittedEvent(
        'join-request-1',
        'group-1',
        'applicant-1',
        88.5,
        new Date('2026-09-07T10:00:00.000Z'),
      ),
    );

    expect(context.findGroupAssistantUserId).toHaveBeenCalledWith('group-1');
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-05', resourceId: 'join-request-1' },
      { userId: 'assistant-1' },
      'N-05',
    );
  });

  it('N-05: skips silently when the group has no resolvable assistant', async () => {
    context.findGroupAssistantUserId.mockResolvedValue(null);

    await listener.onJoinRequestSubmitted(
      new JoinRequestSubmittedEvent(
        'join-request-1',
        'group-1',
        'applicant-1',
        88.5,
        new Date(),
      ),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('N-03: notifies the Applicant, addressed at the new Membership', async () => {
    await listener.onJoinRequestAccepted(
      new JoinRequestAcceptedEvent(
        'join-request-1',
        'membership-1',
        'applicant-1',
      ),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-03', resourceId: 'membership-1' },
      { userId: 'applicant-1' },
      'N-03',
    );
  });

  it('N-04: notifies the Applicant, addressed at the JoinRequest', async () => {
    await listener.onJoinRequestRejected(
      new JoinRequestRejectedEvent('join-request-1', 'applicant-1'),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-04', resourceId: 'join-request-1' },
      { userId: 'applicant-1' },
      'N-04',
    );
  });

  it('never propagates a failure back to the emitting use case (ADR-032)', async () => {
    context.findGroupAssistantUserId.mockRejectedValue(
      new Error('postgres unreachable'),
    );

    await expect(
      listener.onJoinRequestSubmitted(
        new JoinRequestSubmittedEvent(
          'join-request-1',
          'group-1',
          'applicant-1',
          88.5,
          new Date(),
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it('carries no membership re-check on any of the three (§22.3 is N-01s rule set)', async () => {
    await listener.onJoinRequestAccepted(
      new JoinRequestAcceptedEvent('jr-1', 'membership-1', 'applicant-1'),
    );
    await listener.onJoinRequestRejected(
      new JoinRequestRejectedEvent('jr-2', 'applicant-2'),
    );

    for (const call of notifications.dispatch.mock.calls) {
      expect(call[0].recheckMembershipId).toBeUndefined();
    }
  });
});
