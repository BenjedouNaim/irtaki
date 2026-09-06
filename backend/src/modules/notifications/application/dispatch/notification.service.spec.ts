/* eslint-disable @typescript-eslint/unbound-method */
import type { INotificationDispatchContextRepository } from '../../domain/notification-dispatch-context.repository.interface';
import type { INotificationLogRepository } from '../../domain/notification-log.repository.interface';
import type { IPushSender } from '../../domain/push-sender.interface';
import { NotificationService } from './notification.service';

describe('NotificationService.dispatch (SA §21)', () => {
  let context: jest.Mocked<INotificationDispatchContextRepository>;
  let log: jest.Mocked<INotificationLogRepository>;
  let sender: jest.Mocked<IPushSender>;
  let service: NotificationService;

  const now = new Date('2026-09-07T19:00:00.000Z');
  const recipient = { userId: 'user-1' };

  beforeEach(() => {
    context = {
      findLiveDeviceTokens: jest
        .fn()
        .mockResolvedValue([{ id: 'device-1', token: 'ExponentPushToken[a]' }]),
      invalidateDeviceToken: jest.fn().mockResolvedValue(undefined),
      findPreference: jest
        .fn()
        .mockResolvedValue({ isMutable: true, muted: false }),
      findMembershipSuppressionContext: jest.fn().mockResolvedValue({
        membershipState: 'Active',
        groupLifecycleState: 'Active',
        recitationDay: 5,
        localToday: '2026-09-07',
        reportExistsToday: false,
      }),
      findMembershipHolderUserId: jest.fn(),
      findGroupAssistantUserId: jest.fn(),
      findJoinRequestApplicants: jest.fn().mockResolvedValue([]),
    };
    log = {
      record: jest.fn().mockResolvedValue(undefined),
      hasEntrySince: jest.fn().mockResolvedValue(false),
      hasEntryForSubjectSince: jest.fn().mockResolvedValue(false),
    };
    sender = {
      send: jest
        .fn()
        .mockResolvedValue({ status: 'sent', transportReference: 'ticket-1' }),
    };
    service = new NotificationService(context, log, sender);
  });

  it('sends and logs Sent, with a two-field payload', async () => {
    const result = await service.dispatch(
      { type: 'N-05', resourceId: 'join-request-1' },
      recipient,
      'N-05',
      now,
    );

    expect(result).toEqual({
      outcome: 'Sent',
      reason: null,
      transportReference: 'ticket-1',
    });
    const [, payload] = sender.send.mock.calls[0];
    expect(Object.keys(payload)).toEqual(['eventType', 'resourceId']);
    expect(log.record).toHaveBeenCalledWith({
      userId: 'user-1',
      category: 'N-05',
      // ISS #135: the row records WHAT it was about, not only WHO it went
      // to — and it is the same identifier the payload carried.
      subjectId: 'join-request-1',
      outcome: 'Sent',
      transportReference: 'ticket-1',
      dispatchedAt: now,
    });
  });

  it('suppresses a muted mutable category before touching the transport', async () => {
    context.findPreference.mockResolvedValue({ isMutable: true, muted: true });

    const result = await service.dispatch(
      { type: 'N-01', resourceId: 'membership-1' },
      recipient,
      'N-01',
      now,
    );

    expect(result.outcome).toBe('Suppressed');
    expect(result.reason).toBe('CATEGORY_MUTED');
    expect(sender.send).not.toHaveBeenCalled();
    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'Suppressed',
        category: 'N-01',
        subjectId: 'membership-1',
      }),
    );
  });

  it('never lets an account-critical category be suppressed by mute (BR-61)', async () => {
    // A stored `muted = true` cannot exist for these categories (DB-CHK-09),
    // but even if it did, `is_mutable = false` skips the check entirely.
    context.findPreference.mockResolvedValue({ isMutable: false, muted: true });

    for (const category of ['N-03', 'N-04', 'N-08'] as const) {
      const result = await service.dispatch(
        { type: category, resourceId: 'resource-1' },
        recipient,
        category,
        now,
      );
      expect(result.outcome).toBe('Sent');
    }
    expect(sender.send).toHaveBeenCalledTimes(3);
  });

  it('re-checks §22.3 for an event that names a membership', async () => {
    context.findMembershipSuppressionContext.mockResolvedValue({
      membershipState: 'Active',
      groupLifecycleState: 'Archived',
      recitationDay: 5,
      localToday: '2026-09-07',
      reportExistsToday: false,
    });

    const result = await service.dispatch(
      {
        type: 'N-01',
        resourceId: 'membership-1',
        recheckMembershipId: 'membership-1',
      },
      recipient,
      'N-01',
      now,
    );

    expect(result.outcome).toBe('Suppressed');
    expect(result.reason).toBe('GROUP_ARCHIVED');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('does not re-check §22.3 for an event that names no membership', async () => {
    await service.dispatch(
      { type: 'N-05', resourceId: 'join-request-1' },
      recipient,
      'N-05',
      now,
    );

    expect(context.findMembershipSuppressionContext).not.toHaveBeenCalled();
  });

  it('suppresses when no live device token exists (UC-15 E1)', async () => {
    context.findLiveDeviceTokens.mockResolvedValue([]);

    const result = await service.dispatch(
      { type: 'N-03', resourceId: 'membership-1' },
      recipient,
      'N-03',
      now,
    );

    expect(result.outcome).toBe('Suppressed');
    expect(result.reason).toBe('NO_DEVICE_TOKEN');
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('retries a transient failure exactly once (SAS §22.5)', async () => {
    sender.send
      .mockResolvedValueOnce({
        status: 'transient-failure',
        transportReference: null,
      })
      .mockResolvedValueOnce({
        status: 'sent',
        transportReference: 'ticket-2',
      });

    const result = await service.dispatch(
      { type: 'N-02', resourceId: 'membership-1' },
      recipient,
      'N-02',
      now,
    );

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('Sent');
  });

  it('logs Failed after a retried transient failure still fails', async () => {
    sender.send.mockResolvedValue({
      status: 'transient-failure',
      transportReference: null,
    });

    const result = await service.dispatch(
      { type: 'N-02', resourceId: 'membership-1' },
      recipient,
      'N-02',
      now,
    );

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(result.outcome).toBe('Failed');
    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'Failed' }),
    );
  });

  it('invalidates a rejected token and never retries it (UC-15 E2)', async () => {
    sender.send.mockResolvedValue({
      status: 'invalid-token',
      transportReference: null,
      detail: 'DeviceNotRegistered',
    });

    const result = await service.dispatch(
      { type: 'N-08', resourceId: 'membership-1' },
      recipient,
      'N-08',
      now,
    );

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(context.invalidateDeviceToken).toHaveBeenCalledWith('device-1');
    expect(result.outcome).toBe('Failed');
  });

  it('never throws when the transport blows up (BR-60, ADR-032)', async () => {
    sender.send.mockRejectedValue(new Error('FCM unreachable'));

    await expect(
      service.dispatch(
        { type: 'N-03', resourceId: 'membership-1' },
        recipient,
        'N-03',
        now,
      ),
    ).resolves.toEqual({
      outcome: 'Failed',
      reason: null,
      transportReference: null,
    });
    // FR-NOTIF-08: the outcome is still on record.
    expect(log.record).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'N-03', outcome: 'Failed' }),
    );
  });

  it('never throws when the log write itself fails', async () => {
    log.record.mockRejectedValue(new Error('postgres unreachable'));

    await expect(
      service.dispatch(
        { type: 'N-03', resourceId: 'membership-1' },
        recipient,
        'N-03',
        now,
      ),
    ).resolves.toEqual(expect.objectContaining({ outcome: 'Failed' }));
  });

  it('fails cleanly when the category is not in the DBT-15 catalogue', async () => {
    context.findPreference.mockResolvedValue(null);

    const result = await service.dispatch(
      { type: 'N-01', resourceId: 'membership-1' },
      recipient,
      'N-01',
      now,
    );

    expect(result.outcome).toBe('Failed');
    expect(sender.send).not.toHaveBeenCalled();
  });
});
