import type { INotificationEvaluationRepository } from '../../domain/notification-evaluation.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { WeeklyReportAvailableEvaluator } from './weekly-report-available.evaluator';

const TICK_MINUTES = 15;

/** Friday recitation day (ISO 5) in two very different timezones. */
const TUNIS = {
  membershipId: 'membership-tunis',
  userId: 'user-tunis',
  timezone: 'Africa/Tunis',
  recitationDay: 5,
};
const AUCKLAND = {
  membershipId: 'membership-auckland',
  userId: 'user-auckland',
  timezone: 'Pacific/Auckland',
  recitationDay: 5,
};

describe('WeeklyReportAvailableEvaluator — N-02 at the local start of the recitation day', () => {
  let repository: jest.Mocked<INotificationEvaluationRepository>;
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let evaluator: WeeklyReportAvailableEvaluator;

  beforeEach(() => {
    repository = {
      findReminderCandidates: jest.fn().mockResolvedValue([TUNIS, AUCKLAND]),
      findAtRiskCandidates: jest.fn().mockResolvedValue([]),
      findPaymentCandidates: jest.fn().mockResolvedValue([]),
    };
    notifications = {
      dispatch: jest.fn().mockResolvedValue({
        outcome: 'Sent',
        reason: null,
        transportReference: 'ticket-1',
      }),
    };
    evaluator = new WeeklyReportAvailableEvaluator(
      repository,
      notifications as unknown as NotificationService,
    );
  });

  function dispatchedUserIds(): string[] {
    return notifications.dispatch.mock.calls.map((call) => call[1].userId);
  }

  it('fires for Auckland twelve hours before Tunis, off the same Friday', async () => {
    // Auckland (UTC+12) enters Friday 2026-09-11 at 2026-09-10T12:00Z.
    await evaluator.evaluate(
      new Date('2026-09-10T12:00:00.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual(['user-auckland']);

    notifications.dispatch.mockClear();

    // Tunis (UTC+1) enters the same Friday at 2026-09-10T23:00Z.
    await evaluator.evaluate(
      new Date('2026-09-10T23:00:00.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual(['user-tunis']);
  });

  it('does not fire at local midnight of a day that is not the recitation day', async () => {
    // Tunis enters Thursday 2026-09-10 at 2026-09-09T23:00Z.
    const outcome = await evaluator.evaluate(
      new Date('2026-09-09T23:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(outcome).toEqual({ candidates: 2, triggered: 0, sent: 0 });
  });

  it('does not fire later in the recitation day, only at its start', async () => {
    await evaluator.evaluate(
      new Date('2026-09-11T10:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('carries a two-field N-02 payload addressed at the membership', async () => {
    await evaluator.evaluate(
      new Date('2026-09-10T23:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-02', resourceId: 'membership-tunis' },
      { userId: 'user-tunis' },
      'N-02',
      new Date('2026-09-10T23:00:00.000Z'),
    );
  });
});
