/* eslint-disable @typescript-eslint/unbound-method */
import type { AtRiskCandidate } from '../../domain/notification-evaluation.repository.interface';
import type { INotificationEvaluationRepository } from '../../domain/notification-evaluation.repository.interface';
import type { INotificationLogRepository } from '../../domain/notification-log.repository.interface';
import type { NotificationService } from '../dispatch/notification.service';
import { AtRiskEvaluator } from './at-risk.evaluator';

/** Friday recitation day; four expected days missed by 2026-09-07. */
function candidate(overrides: Partial<AtRiskCandidate> = {}): AtRiskCandidate {
  return {
    membershipId: 'membership-1',
    teacherUserId: 'teacher-1',
    timezone: 'Africa/Tunis',
    recitationDay: 5,
    startedAt: '2026-06-01',
    endedAt: null,
    archivedAt: null,
    lastReportDate: '2026-09-02',
    ...overrides,
  };
}

describe('AtRiskEvaluator — N-07, once per episode (ISS-17)', () => {
  let repository: jest.Mocked<INotificationEvaluationRepository>;
  let log: jest.Mocked<INotificationLogRepository>;
  let notifications: jest.Mocked<Pick<NotificationService, 'dispatch'>>;
  let evaluator: AtRiskEvaluator;

  beforeEach(() => {
    repository = {
      findReminderCandidates: jest.fn().mockResolvedValue([]),
      findAtRiskCandidates: jest.fn().mockResolvedValue([candidate()]),
      findPaymentCandidates: jest.fn().mockResolvedValue([]),
    };
    log = {
      record: jest.fn().mockResolvedValue(undefined),
      hasEntrySince: jest.fn().mockResolvedValue(false),
      hasEntryForSubjectSince: jest.fn().mockResolvedValue(false),
    };
    notifications = {
      dispatch: jest.fn().mockResolvedValue({
        outcome: 'Sent',
        reason: null,
        transportReference: 'ticket-1',
      }),
    };
    evaluator = new AtRiskEvaluator(
      repository,
      log,
      notifications as unknown as NotificationService,
    );
  });

  it('notifies the Teacher, not the Student, when DS-04 holds', async () => {
    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T00:00:00.000Z'),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-07', resourceId: 'membership-1' },
      { userId: 'teacher-1' },
      'N-07',
      new Date('2026-09-07T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ candidates: 1, triggered: 1, sent: 1 });
  });

  it("does not notify below DS-04's three-expected-day threshold", async () => {
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ lastReportDate: '2026-09-05' }),
    ]);

    await evaluator.evaluate(new Date('2026-09-07T00:00:00.000Z'));

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(log.hasEntryForSubjectSince).not.toHaveBeenCalled();
  });

  it('asks notification_log about the episode window before dispatching', async () => {
    await evaluator.evaluate(new Date('2026-09-07T00:00:00.000Z'));

    expect(log.hasEntryForSubjectSince).toHaveBeenCalledWith(
      'teacher-1',
      'N-07',
      'membership-1',
      new Date('2026-09-04T00:00:00.000Z'),
    );
    // ISS #135: never the unnarrowed probe — that is the one that conflates
    // two students of the same Teacher.
    expect(log.hasEntrySince).not.toHaveBeenCalled();
  });

  it('stays silent on the following days of the SAME episode', async () => {
    log.hasEntryForSubjectSince.mockResolvedValue(true);

    const outcome = await evaluator.evaluate(
      new Date('2026-09-08T00:00:00.000Z'),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(outcome).toEqual({ candidates: 1, triggered: 0, sent: 0 });
  });

  it('notifies again for a NEW episode after a report broke the streak', async () => {
    // The student reported on 2026-09-08, then relapsed by 2026-09-13.
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ lastReportDate: '2026-09-08' }),
    ]);

    await evaluator.evaluate(new Date('2026-09-13T00:00:00.000Z'));

    // The window moved with the report, so the previous episode's row —
    // written on 2026-09-07 — cannot suppress this one.
    expect(log.hasEntryForSubjectSince).toHaveBeenCalledWith(
      'teacher-1',
      'N-07',
      'membership-1',
      new Date('2026-09-10T00:00:00.000Z'),
    );
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });

  it('anchors the window at started_at for a student who never reported', async () => {
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ lastReportDate: null, startedAt: '2026-09-01' }),
    ]);

    await evaluator.evaluate(new Date('2026-09-07T00:00:00.000Z'));

    expect(log.hasEntryForSubjectSince).toHaveBeenCalledWith(
      'teacher-1',
      'N-07',
      'membership-1',
      new Date('2026-09-03T00:00:00.000Z'),
    );
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
  });

  it("resolves today in the STUDENT's timezone, not the server's", async () => {
    // 2026-09-06T23:30Z is already 2026-09-07 in Tunis (UTC+1) — a fourth
    // expected day — but still 2026-09-06 in UTC, which would be three.
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ timezone: 'Africa/Tunis', lastReportDate: '2026-09-03' }),
    ]);

    await evaluator.evaluate(new Date('2026-09-06T23:30:00.000Z'));
    expect(notifications.dispatch).toHaveBeenCalledTimes(1);

    notifications.dispatch.mockClear();
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({
        timezone: 'Pacific/Honolulu', // UTC-10: still 2026-09-06 there
        lastReportDate: '2026-09-03',
      }),
    ]);
    await evaluator.evaluate(new Date('2026-09-06T23:30:00.000Z'));
    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────
  // ISS #135 — the guard is per (recipient, subject), not per recipient
  // ────────────────────────────────────────────────────────────────────

  it('notifies once PER STUDENT when one Teacher has two at-risk students', async () => {
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ membershipId: 'membership-a' }),
      candidate({ membershipId: 'membership-b' }),
    ]);

    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T00:00:00.000Z'),
    );

    expect(notifications.dispatch).toHaveBeenCalledTimes(2);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-07', resourceId: 'membership-a' },
      { userId: 'teacher-1' },
      'N-07',
      new Date('2026-09-07T00:00:00.000Z'),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-07', resourceId: 'membership-b' },
      { userId: 'teacher-1' },
      'N-07',
      new Date('2026-09-07T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ candidates: 2, triggered: 2, sent: 2 });
  });

  it("one student's episode row does not suppress the other student's", async () => {
    repository.findAtRiskCandidates.mockResolvedValue([
      candidate({ membershipId: 'membership-a' }),
      candidate({ membershipId: 'membership-b' }),
    ]);
    // Only membership-a has already been notified about in this window.
    log.hasEntryForSubjectSince.mockImplementation(
      (_userId, _category, subjectId) =>
        Promise.resolve(subjectId === 'membership-a'),
    );

    const outcome = await evaluator.evaluate(
      new Date('2026-09-07T00:00:00.000Z'),
    );

    expect(notifications.dispatch).toHaveBeenCalledTimes(1);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      { type: 'N-07', resourceId: 'membership-b' },
      { userId: 'teacher-1' },
      'N-07',
      new Date('2026-09-07T00:00:00.000Z'),
    );
    expect(outcome).toEqual({ candidates: 2, triggered: 1, sent: 1 });
  });
});
