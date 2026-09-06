/* eslint-disable @typescript-eslint/unbound-method */
import { MembershipTerminatedEvent } from '../../../memberships/domain/events/membership-terminated.event';
import type { INotificationDispatchContextRepository } from '../../domain/notification-dispatch-context.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { MembershipNotificationListener } from './membership-notification.listener';

describe('MembershipNotificationListener — N-08', () => {
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let context: jest.Mocked<INotificationDispatchContextRepository>;
  let listener: MembershipNotificationListener;

  const event = new MembershipTerminatedEvent(
    'membership-1',
    'admin-1',
    '2026-09-07',
  );

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
      findMembershipHolderUserId: jest.fn().mockResolvedValue('student-1'),
      findGroupAssistantUserId: jest.fn(),
      findJoinRequestApplicants: jest.fn().mockResolvedValue([]),
    };
    listener = new MembershipNotificationListener(
      notifications as unknown as NotificationService,
      context,
    );
  });

  it('resolves the removed Student from DE-09s membership id and notifies them', async () => {
    await listener.onMembershipTerminated(event);

    expect(context.findMembershipHolderUserId).toHaveBeenCalledWith(
      'membership-1',
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-08', resourceId: 'membership-1' },
      { userId: 'student-1' },
      'N-08',
    );
  });

  it('skips silently when the membership has no resolvable holder', async () => {
    context.findMembershipHolderUserId.mockResolvedValue(null);

    await listener.onMembershipTerminated(event);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('never propagates a failure back to DELETE /memberships/{id} (ADR-032)', async () => {
    context.findMembershipHolderUserId.mockRejectedValue(
      new Error('postgres unreachable'),
    );

    await expect(
      listener.onMembershipTerminated(event),
    ).resolves.toBeUndefined();
  });
});
