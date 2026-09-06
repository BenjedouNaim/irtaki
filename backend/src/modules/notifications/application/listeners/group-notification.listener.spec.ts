/* eslint-disable @typescript-eslint/unbound-method */
import { GroupArchivedEvent } from '../../../groups/domain/events/group-archived.event';
import type { INotificationDispatchContextRepository } from '../../domain/notification-dispatch-context.repository.interface';
import type { INotificationLogRepository } from '../../domain/notification-log.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { GroupNotificationListener } from './group-notification.listener';

/** The instant the archival transaction stamped (DS-07). */
const ARCHIVED_AT = new Date('2026-09-07T10:00:00.000Z');

describe('GroupNotificationListener — N-04 on DE-10 (DS-07 auto-rejection)', () => {
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let context: jest.Mocked<INotificationDispatchContextRepository>;
  let log: jest.Mocked<INotificationLogRepository>;
  let listener: GroupNotificationListener;

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
      findGroupAssistantUserId: jest.fn(),
      findJoinRequestApplicants: jest.fn().mockResolvedValue([
        { joinRequestId: 'jr-1', userId: 'applicant-1' },
        { joinRequestId: 'jr-2', userId: 'applicant-2' },
      ]),
    };
    log = {
      record: jest.fn().mockResolvedValue(undefined),
      hasEntrySince: jest.fn().mockResolvedValue(false),
      hasEntryForSubjectSince: jest.fn().mockResolvedValue(false),
    };
    listener = new GroupNotificationListener(
      notifications as unknown as NotificationService,
      context,
      log,
    );
  });

  it('fans N-04 out to every auto-rejected applicant, one per request', async () => {
    await listener.onGroupArchived(
      new GroupArchivedEvent('group-1', ARCHIVED_AT, ['jr-1', 'jr-2']),
    );

    expect(context.findJoinRequestApplicants).toHaveBeenCalledWith([
      'jr-1',
      'jr-2',
    ]);
    expect(notifications.dispatch).toHaveBeenCalledTimes(2);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-04', resourceId: 'jr-1' },
      { userId: 'applicant-1' },
      'N-04',
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-04', resourceId: 'jr-2' },
      { userId: 'applicant-2' },
      'N-04',
    );
  });

  it('does nothing at all when the archived group had no pending requests', async () => {
    context.findJoinRequestApplicants.mockResolvedValue([]);

    await listener.onGroupArchived(
      new GroupArchivedEvent('group-1', ARCHIVED_AT, []),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not double-notify when DE-10 is delivered twice', async () => {
    // The first delivery wrote the rows; the second finds them.
    log.hasEntryForSubjectSince.mockResolvedValueOnce(false);
    log.hasEntryForSubjectSince.mockResolvedValueOnce(false);
    log.hasEntryForSubjectSince.mockResolvedValue(true);

    const event = new GroupArchivedEvent('group-1', ARCHIVED_AT, [
      'jr-1',
      'jr-2',
    ]);
    await listener.onGroupArchived(event);
    await listener.onGroupArchived(event);

    expect(notifications.dispatch).toHaveBeenCalledTimes(2);
    expect(log.hasEntryForSubjectSince).toHaveBeenCalledWith(
      'applicant-1',
      'N-04',
      'jr-1',
      ARCHIVED_AT,
    );
  });

  it('skips only the applicant already notified, not the whole batch', async () => {
    log.hasEntryForSubjectSince.mockImplementation(
      (_userId, _category, subjectId) => Promise.resolve(subjectId === 'jr-1'),
    );

    await listener.onGroupArchived(
      new GroupArchivedEvent('group-1', ARCHIVED_AT, ['jr-1', 'jr-2']),
    );

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-04', resourceId: 'jr-2' },
      { userId: 'applicant-2' },
      'N-04',
    );
  });

  it('dispatches N-04 through the single path, with no membership re-check', async () => {
    await listener.onGroupArchived(
      new GroupArchivedEvent('group-1', ARCHIVED_AT, ['jr-1', 'jr-2']),
    );

    // BR-61 / FR-NOTIF-06: the account-critical decision belongs to
    // `dispatch`, which reads `notification_categories.is_mutable`. The
    // listener must not consult a preference or a hard-coded list itself.
    expect(context.findPreference).not.toHaveBeenCalled();
    for (const call of notifications.dispatch.mock.calls) {
      expect(call[0].recheckMembershipId).toBeUndefined();
      expect(call[2]).toBe('N-04');
    }
  });

  it('never propagates a failure back to the archiving use case (ADR-032)', async () => {
    context.findJoinRequestApplicants.mockRejectedValue(
      new Error('postgres unreachable'),
    );

    await expect(
      listener.onGroupArchived(
        new GroupArchivedEvent('group-1', ARCHIVED_AT, ['jr-1']),
      ),
    ).resolves.toBeUndefined();
  });

  it('still notifies the applicants it could resolve when one id is unresolvable', async () => {
    context.findJoinRequestApplicants.mockResolvedValue([
      { joinRequestId: 'jr-2', userId: 'applicant-2' },
    ]);

    await listener.onGroupArchived(
      new GroupArchivedEvent('group-1', ARCHIVED_AT, ['jr-1', 'jr-2']),
    );

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-04', resourceId: 'jr-2' },
      { userId: 'applicant-2' },
      'N-04',
    );
  });
});
