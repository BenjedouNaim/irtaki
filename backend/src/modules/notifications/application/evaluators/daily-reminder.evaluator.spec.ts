import type { INotificationEvaluationRepository } from '../../domain/notification-evaluation.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { DailyReminderEvaluator } from './daily-reminder.evaluator';

const TICK_MINUTES = 15;

/**
 * Two students, one instant, two timezones — the fixture EPIC-08's
 * acceptance criteria name ("scheduler-evaluator tests pass for at least
 * two distinct timezones") and the shape of the AR-05 risk the Development
 * Plan calls out.
 */
const TUNIS = {
  membershipId: 'membership-tunis',
  userId: 'user-tunis',
  timezone: 'Africa/Tunis', // UTC+1, no DST
  recitationDay: 5,
};
const AUCKLAND = {
  membershipId: 'membership-auckland',
  userId: 'user-auckland',
  timezone: 'Pacific/Auckland', // UTC+12 / +13 with DST
  recitationDay: 5,
};

describe('DailyReminderEvaluator — N-01 at 20:00 student-local (ADR-030)', () => {
  let repository: jest.Mocked<INotificationEvaluationRepository>;
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let evaluator: DailyReminderEvaluator;

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
    evaluator = new DailyReminderEvaluator(
      repository,
      notifications as unknown as NotificationService,
    );
  });

  function dispatchedUserIds(): string[] {
    return notifications.dispatch.mock.calls.map((call) => call[1].userId);
  }

  it('reminds the Tunis student at 19:00Z — their own 20:00 — and nobody else', async () => {
    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T19:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(dispatchedUserIds()).toEqual(['user-tunis']);
    expect(outcome).toEqual({ candidates: 2, triggered: 1, sent: 1 });
  });

  it('reminds the Auckland student at 08:00Z — their own 20:00 — and nobody else', async () => {
    // 2026-09-07 is NZST (UTC+12): 08:00Z is 20:00 local.
    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T08:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(dispatchedUserIds()).toEqual(['user-auckland']);
    expect(outcome.triggered).toBe(1);
  });

  it('follows Auckland across its DST change rather than a fixed offset', async () => {
    // NZDT (UTC+13) from late September: their 20:00 is now 07:00Z, and
    // 08:00Z — which reminded them in September — is 21:00 local.
    await evaluator.evaluate(
      new Date('2026-10-05T07:00:00.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual(['user-auckland']);

    notifications.dispatch.mockClear();
    await evaluator.evaluate(
      new Date('2026-10-05T08:00:00.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual([]);
  });

  it('fires once per local 20:00 — on the entering tick, not the next one', async () => {
    await evaluator.evaluate(
      new Date('2026-09-07T19:14:59.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual(['user-tunis']);

    notifications.dispatch.mockClear();
    await evaluator.evaluate(
      new Date('2026-09-07T19:15:00.000Z'),
      TICK_MINUTES,
    );
    expect(dispatchedUserIds()).toEqual([]);
  });

  it('reminds nobody on a tick no student is at 20:00 for', async () => {
    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T12:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(outcome).toEqual({ candidates: 2, triggered: 0, sent: 0 });
  });

  it('arms the §22.3 membership re-check by naming the membership', async () => {
    await evaluator.evaluate(
      new Date('2026-09-07T19:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      {
        type: 'N-01',
        resourceId: 'membership-tunis',
        recheckMembershipId: 'membership-tunis',
      },
      { userId: 'user-tunis' },
      'N-01',
      new Date('2026-09-07T19:00:00.000Z'),
    );
  });

  it('counts a suppressed dispatch as triggered but not sent', async () => {
    notifications.dispatch.mockResolvedValue({
      outcome: 'Suppressed',
      reason: 'REPORT_ALREADY_EXISTS',
      transportReference: null,
    });

    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T19:00:00.000Z'),
      TICK_MINUTES,
    );

    expect(outcome).toEqual({ candidates: 2, triggered: 1, sent: 0 });
  });
});
