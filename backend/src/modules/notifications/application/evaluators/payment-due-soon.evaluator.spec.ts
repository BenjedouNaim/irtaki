/* eslint-disable @typescript-eslint/unbound-method */
import type {
  INotificationEvaluationRepository,
  PaymentCandidate,
} from '../../domain/notification-evaluation.repository.interface';
import type { INotificationLogRepository } from '../../domain/notification-log.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { PaymentDueSoonEvaluator } from './payment-due-soon.evaluator';

/**
 * C0 = 2026-06-01, so cycle 0 is 2026-06-01…2026-08-31 and cycle 1 is
 * 2026-09-01…2026-11-30, whose final ten days open on 2026-11-20 (BR-33).
 */
function candidate(
  overrides: Partial<PaymentCandidate> = {},
): PaymentCandidate {
  return {
    membershipId: 'membership-1',
    userId: 'student-1',
    timezone: 'Africa/Tunis',
    startedAt: '2026-06-01',
    endedAt: null,
    archivedAt: null,
    paidCycles: [{ cycleIndex: 0, paidAt: '2026-06-02T09:00:00.000Z' }],
    ...overrides,
  };
}

describe('PaymentDueSoonEvaluator — N-06, once per cycle (ISS-17)', () => {
  let repository: jest.Mocked<INotificationEvaluationRepository>;
  let log: jest.Mocked<INotificationLogRepository>;
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let evaluator: PaymentDueSoonEvaluator;

  beforeEach(() => {
    repository = {
      findReminderCandidates: jest.fn().mockResolvedValue([]),
      findAtRiskCandidates: jest.fn().mockResolvedValue([]),
      findPaymentCandidates: jest.fn().mockResolvedValue([candidate()]),
    };
    log = {
      record: jest.fn().mockResolvedValue(undefined),
      hasEntrySince: jest.fn().mockResolvedValue(false),
    };
    notifications = {
      dispatch: jest.fn().mockResolvedValue({
        outcome: 'Sent',
        reason: null,
        transportReference: 'ticket-1',
      }),
    };
    evaluator = new PaymentDueSoonEvaluator(
      repository,
      log,
      notifications as unknown as NotificationService,
    );
  });

  it('notifies the Student once the cycle enters its final ten days', async () => {
    const outcome = await evaluator.evaluate(
      new Date('2026-11-25T00:00:00.000Z'),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-06', resourceId: 'membership-1' },
      { userId: 'student-1' },
      'N-06',
      new Date('2026-11-25T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ candidates: 1, triggered: 1, sent: 1 });
  });

  it('stays silent before the BR-33 window opens', async () => {
    await evaluator.evaluate(new Date('2026-11-15T00:00:00.000Z'));

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(log.hasEntrySince).not.toHaveBeenCalled();
  });

  it('stays silent when the current cycle is already paid', async () => {
    repository.findPaymentCandidates.mockResolvedValue([
      candidate({
        paidCycles: [
          { cycleIndex: 0, paidAt: '2026-06-02T09:00:00.000Z' },
          { cycleIndex: 1, paidAt: '2026-09-02T09:00:00.000Z' },
        ],
      }),
    ]);

    await evaluator.evaluate(new Date('2026-11-25T00:00:00.000Z'));

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('asks notification_log about the current cycle before dispatching', async () => {
    await evaluator.evaluate(new Date('2026-11-25T00:00:00.000Z'));

    expect(log.hasEntrySince).toHaveBeenCalledWith(
      'student-1',
      'N-06',
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  it('fires ONCE, not daily, across the whole ten-day window', async () => {
    // Day 1 of the window: nothing logged yet, so it fires.
    await evaluator.evaluate(new Date('2026-11-20T00:00:00.000Z'));
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);

    // Days 2..10: the row written on day 1 is inside the cycle window.
    log.hasEntrySince.mockResolvedValue(true);
    for (let day = 21; day <= 30; day += 1) {
      await evaluator.evaluate(new Date(`2026-11-${day}T00:00:00.000Z`));
    }
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });

  it('fires again for the NEXT cycle, whose window starts later', async () => {
    // Cycle 2 runs 2026-12-01…2027-02-28; its final ten days open 2027-02-19.
    await evaluator.evaluate(new Date('2027-02-20T00:00:00.000Z'));

    expect(log.hasEntrySince).toHaveBeenCalledWith(
      'student-1',
      'N-06',
      new Date('2026-12-01T00:00:00.000Z'),
    );
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });

  it("resolves today in the STUDENT's timezone, not the server's", async () => {
    // 2026-11-19T23:30Z is already 2026-11-20 in Tunis — the first day of
    // the BR-33 window — but still 2026-11-19 in UTC.
    await evaluator.evaluate(new Date('2026-11-19T23:30:00.000Z'));
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);

    notifications.dispatch.mockClear();
    repository.findPaymentCandidates.mockResolvedValue([
      candidate({ timezone: 'Pacific/Honolulu' }),
    ]);
    await evaluator.evaluate(new Date('2026-11-19T23:30:00.000Z'));
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
