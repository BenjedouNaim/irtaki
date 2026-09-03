/* eslint-disable @typescript-eslint/unbound-method */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WeeklyReportFinalisedEvent } from '../../domain/events/weekly-report-finalised.event';
import {
  IWeeklyReportRepository,
  WeeklyReportRecord,
  WeeklyReportWithTimezoneRecord,
} from '../../domain/weekly-report.repository.interface';
import { WeeklyReportFinalizationService } from './weekly-report-finalization.service';

describe('WeeklyReportFinalizationService (DS-02, FR-WR-06)', () => {
  let service: WeeklyReportFinalizationService;
  let repository: jest.Mocked<IWeeklyReportRepository>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  const openRow = (
    id: string,
    weekEnd: string,
    timezone: string,
  ): WeeklyReportWithTimezoneRecord => ({
    id,
    membershipId: `membership-${id}`,
    weekStart: '2026-08-29',
    weekEnd,
    expectedDays: 6,
    missedDailyReports: 6,
    missedDailyMemorization: 6,
    missedDailyRevision: 6,
    missed50Repetitions: 0,
    missedSingleSession: 0,
    attendedRecitationCall: false,
    state: 'Open',
    finalisedAt: null,
    finalisedBy: null,
    timezone,
  });

  const finalised = (
    row: WeeklyReportWithTimezoneRecord,
    at: Date,
  ): WeeklyReportRecord => {
    return {
      id: row.id,
      membershipId: row.membershipId,
      weekStart: row.weekStart,
      weekEnd: row.weekEnd,
      expectedDays: row.expectedDays,
      missedDailyReports: row.missedDailyReports,
      missedDailyMemorization: row.missedDailyMemorization,
      missedDailyRevision: row.missedDailyRevision,
      missed50Repetitions: row.missed50Repetitions,
      missedSingleSession: row.missedSingleSession,
      attendedRecitationCall: false,
      state: 'Finalised',
      finalisedAt: at.toISOString(),
      finalisedBy: null,
    };
  };

  beforeEach(() => {
    repository = {
      findCurrentWeekContextByUserId: jest.fn(),
      findByMembershipAndWeekStart: jest.fn(),
      createIfAbsent: jest.fn(),
      findOwnById: jest.fn(),
      finaliseByStudent: jest.fn(),
      findAllOpenWithTimezone: jest.fn(),
      countAttendedFinalisedWeeks: jest.fn(),
      finaliseAsScheduler: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
      findHistoryByMembershipId: jest.fn(),
    };
    eventEmitter = { emit: jest.fn().mockReturnValue(true) };
    service = new WeeklyReportFinalizationService(
      repository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('finalises only the Open rows whose recitation day has passed in their holder timezone (ADR-030 per-timezone filter)', async () => {
    // 2026-09-04T23:30:00Z: 00:30 on the 5th in Tunis, 11:30 on the 5th in
    // Auckland, 16:30 on the 4th in Los Angeles.
    const now = new Date('2026-09-04T23:30:00.000Z');
    const tunis = openRow('a', '2026-09-04', 'Africa/Tunis');
    const auckland = openRow('b', '2026-09-04', 'Pacific/Auckland');
    const losAngeles = openRow('c', '2026-09-04', 'America/Los_Angeles');
    const notYet = openRow('d', '2026-09-06', 'Africa/Tunis');
    repository.findAllOpenWithTimezone.mockResolvedValue([
      tunis,
      auckland,
      losAngeles,
      notYet,
    ]);
    repository.finaliseAsScheduler.mockResolvedValue([
      finalised(tunis, now),
      finalised(auckland, now),
    ]);

    const outcome = await service.finaliseOverdue(now);

    expect(repository.finaliseAsScheduler).toHaveBeenCalledWith(
      ['a', 'b'],
      now,
    );
    expect(outcome).toEqual({ candidates: 4, finalised: 2 });
  });

  it('catches up any overdue row however old (SAS §19.6, EC-39)', async () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const stale = openRow('old', '2026-08-28', 'Africa/Tunis');
    repository.findAllOpenWithTimezone.mockResolvedValue([stale]);
    repository.finaliseAsScheduler.mockResolvedValue([finalised(stale, now)]);

    const outcome = await service.finaliseOverdue(now);

    expect(repository.finaliseAsScheduler).toHaveBeenCalledWith(['old'], now);
    expect(outcome.finalised).toBe(1);
  });

  it('emits DE-07 per finalised row with attended = false and finalised_by = null (Scheduler path)', async () => {
    const now = new Date('2026-09-04T23:30:00.000Z');
    const row = openRow('a', '2026-09-04', 'Africa/Tunis');
    repository.findAllOpenWithTimezone.mockResolvedValue([row]);
    repository.finaliseAsScheduler.mockResolvedValue([finalised(row, now)]);

    await service.finaliseOverdue(now);

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    const [name, event] = eventEmitter.emit.mock.calls[0] as [
      string,
      WeeklyReportFinalisedEvent,
    ];
    expect(name).toBe(WeeklyReportFinalisedEvent.EVENT_NAME);
    expect(event).toEqual(
      expect.objectContaining({
        membershipId: 'membership-a',
        week: { weekStart: '2026-08-29', weekEnd: '2026-09-04' },
        attended: false,
        finalisedBy: null,
      }),
    );
  });

  it('emits nothing and reports the rows the UPDATE actually finalised when a student won the race (VR-36)', async () => {
    const now = new Date('2026-09-04T23:30:00.000Z');
    const row = openRow('a', '2026-09-04', 'Africa/Tunis');
    repository.findAllOpenWithTimezone.mockResolvedValue([row]);
    // Guarded UPDATE matched zero rows: confirmed between read and write.
    repository.finaliseAsScheduler.mockResolvedValue([]);

    const outcome = await service.finaliseOverdue(now);

    expect(outcome).toEqual({ candidates: 1, finalised: 0 });
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('is a no-op with no candidates — safe to re-run (AR-17, EC-40)', async () => {
    repository.findAllOpenWithTimezone.mockResolvedValue([]);
    repository.finaliseAsScheduler.mockResolvedValue([]);

    const outcome = await service.finaliseOverdue(new Date());

    expect(repository.finaliseAsScheduler).toHaveBeenCalledWith(
      [],
      expect.any(Date),
    );
    expect(outcome).toEqual({ candidates: 0, finalised: 0 });
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('keeps finalising when a listener throws (ADR-032)', async () => {
    const now = new Date('2026-09-04T23:30:00.000Z');
    const a = openRow('a', '2026-09-04', 'Africa/Tunis');
    const b = openRow('b', '2026-09-04', 'Africa/Tunis');
    repository.findAllOpenWithTimezone.mockResolvedValue([a, b]);
    repository.finaliseAsScheduler.mockResolvedValue([
      finalised(a, now),
      finalised(b, now),
    ]);
    eventEmitter.emit.mockImplementation(() => {
      throw new Error('listener exploded');
    });

    await expect(service.finaliseOverdue(now)).resolves.toEqual({
      candidates: 2,
      finalised: 2,
    });
    expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
  });
});
