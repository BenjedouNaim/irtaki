/* eslint-disable @typescript-eslint/unbound-method */
import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WeeklyReportFinalisedEvent } from '../../domain/events/weekly-report-finalised.event';
import {
  IWeeklyReportRepository,
  WeeklyReportRecord,
  WeeklyReportWithTimezoneRecord,
} from '../../domain/weekly-report.repository.interface';
import { ConfirmWeeklyReportUseCase } from './confirm-weekly-report.use-case';

describe('ConfirmWeeklyReportUseCase (F-WR-02 / API-034)', () => {
  let useCase: ConfirmWeeklyReportUseCase;
  let repository: jest.Mocked<IWeeklyReportRepository>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;

  const userId = 'student-1';
  // Recitation day Friday 2026-09-04, student in Africa/Tunis (UTC+1).
  // 10:00 local on the recitation day.
  const onRecitationDay = new Date('2026-09-04T09:00:00.000Z');
  // 00:30 local the next day — past student-local midnight.
  const afterMidnight = new Date('2026-09-04T23:30:00.000Z');

  const openRow: WeeklyReportWithTimezoneRecord = {
    id: 'weekly-1',
    membershipId: 'membership-1',
    weekStart: '2026-08-29',
    weekEnd: '2026-09-04',
    expectedDays: 6,
    missedDailyReports: 2,
    missedDailyMemorization: 3,
    missedDailyRevision: 4,
    missed50Repetitions: 1,
    missedSingleSession: 0,
    attendedRecitationCall: false,
    state: 'Open',
    finalisedAt: null,
    finalisedBy: null,
    timezone: 'Africa/Tunis',
  };

  const finalisedRow: WeeklyReportRecord = {
    ...openRow,
    attendedRecitationCall: true,
    state: 'Finalised',
    finalisedAt: onRecitationDay.toISOString(),
    finalisedBy: userId,
  };

  beforeEach(() => {
    repository = {
      findCurrentWeekContextByUserId: jest.fn(),
      findByMembershipAndWeekStart: jest.fn(),
      createIfAbsent: jest.fn(),
      findOwnById: jest.fn(),
      finaliseByStudent: jest.fn(),
      findAllOpenWithTimezone: jest.fn(),
      finaliseAsScheduler: jest.fn(),
      findOwnHistoryByUserId: jest.fn(),
    };
    eventEmitter = { emit: jest.fn().mockReturnValue(true) };
    useCase = new ConfirmWeeklyReportUseCase(
      repository,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('finalises an Open row on the recitation day, snapshotting the stored metrics unchanged (UC-06 step 7)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);
    repository.finaliseByStudent.mockResolvedValue(finalisedRow);

    const result = await useCase.execute(
      userId,
      'weekly-1',
      { attended_recitation_call: true },
      onRecitationDay,
    );

    expect(repository.findOwnById).toHaveBeenCalledWith('weekly-1', userId);
    expect(repository.finaliseByStudent).toHaveBeenCalledWith({
      reportId: 'weekly-1',
      attendedRecitationCall: true,
      finalisedBy: userId,
      finalisedAt: onRecitationDay,
    });
    expect(result).toEqual({
      data: {
        id: 'weekly-1',
        week_start: '2026-08-29',
        week_end: '2026-09-04',
        expected_days: 6,
        missed_daily_reports: 2,
        missed_daily_memorization: 3,
        missed_daily_revision: 4,
        missed_50_repetitions: 1,
        missed_single_session: 0,
        attended_recitation_call: true,
        state: 'Finalised',
        finalised_at: onRecitationDay.toISOString(),
        finalised_by: 'Student',
      },
    });
  });

  it('records attended = false when the student answers No', async () => {
    repository.findOwnById.mockResolvedValue(openRow);
    repository.finaliseByStudent.mockResolvedValue({
      ...finalisedRow,
      attendedRecitationCall: false,
    });

    const result = await useCase.execute(
      userId,
      'weekly-1',
      { attended_recitation_call: false },
      onRecitationDay,
    );

    expect(repository.finaliseByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ attendedRecitationCall: false }),
    );
    expect(result.data.attended_recitation_call).toBe(false);
  });

  it('emits DE-07 WeeklyReportFinalised post-commit with finalised_by = the student (ADR-026)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);
    repository.finaliseByStudent.mockResolvedValue(finalisedRow);

    await useCase.execute(
      userId,
      'weekly-1',
      { attended_recitation_call: true },
      onRecitationDay,
    );

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    const [name, event] = eventEmitter.emit.mock.calls[0] as [
      string,
      WeeklyReportFinalisedEvent,
    ];
    expect(name).toBe('weekly-report.finalised');
    expect(event).toBeInstanceOf(WeeklyReportFinalisedEvent);
    expect(event).toEqual(
      expect.objectContaining({
        membershipId: 'membership-1',
        week: { weekStart: '2026-08-29', weekEnd: '2026-09-04' },
        attended: true,
        finalisedBy: userId,
      }),
    );
    // Emitted after the write (ADR-026 post-commit).
    const writeOrder = repository.finaliseByStudent.mock.invocationCallOrder[0];
    const emitOrder = eventEmitter.emit.mock.invocationCallOrder[0];
    expect(writeOrder).toBeLessThan(emitOrder);
  });

  it('never fails the confirmation when a listener throws (ADR-032)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);
    repository.finaliseByStudent.mockResolvedValue(finalisedRow);
    eventEmitter.emit.mockImplementation(() => {
      throw new Error('listener exploded');
    });

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        onRecitationDay,
      ),
    ).resolves.toMatchObject({ data: { state: 'Finalised' } });
  });

  it('answers 403 SCOPE_DENIED for a report outside own scope and writes nothing (NFR-20)', async () => {
    repository.findOwnById.mockResolvedValue(null);

    await expect(
      useCase.execute(
        userId,
        'weekly-other',
        { attended_recitation_call: true },
        onRecitationDay,
      ),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { statusCode: 403, error: 'SCOPE_DENIED' },
    });
    expect(repository.finaliseByStudent).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('answers 409 ALREADY_FINALISED for a Finalised row, before any day check (VR-36, UF §16 "scheduler beat the student")', async () => {
    repository.findOwnById.mockResolvedValue({
      ...openRow,
      attendedRecitationCall: false,
      state: 'Finalised',
      finalisedAt: afterMidnight.toISOString(),
      finalisedBy: null,
    });

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        afterMidnight,
      ),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: { statusCode: 409, error: 'ALREADY_FINALISED' },
    });
    expect(repository.finaliseByStudent).not.toHaveBeenCalled();
  });

  it('answers 422 NOT_RECITATION_DAY before the recitation day (VR-21, EC-41)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        new Date('2026-09-03T12:00:00.000Z'),
      ),
    ).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: { statusCode: 422, error: 'NOT_RECITATION_DAY' },
    });
    expect(repository.finaliseByStudent).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('answers 422 NOT_RECITATION_DAY for an Open row whose day has passed — never confirmable retroactively (EC-24, BR-30)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        afterMidnight,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 422, error: 'NOT_RECITATION_DAY' },
    });
    expect(repository.finaliseByStudent).not.toHaveBeenCalled();
  });

  it('evaluates the recitation day in the student timezone, not the server clock (T-01)', async () => {
    // 23:30 UTC on the 4th is 00:30 on the 5th in Tunis — but still the 4th
    // in Los Angeles: the same instant confirms there and is rejected here.
    repository.findOwnById.mockResolvedValue({
      ...openRow,
      timezone: 'America/Los_Angeles',
    });
    repository.finaliseByStudent.mockResolvedValue(finalisedRow);

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        afterMidnight,
      ),
    ).resolves.toMatchObject({ data: { state: 'Finalised' } });
  });

  it('answers 409 ALREADY_FINALISED when the guarded UPDATE matches zero rows (lost race, TS §20)', async () => {
    repository.findOwnById.mockResolvedValue(openRow);
    repository.finaliseByStudent.mockResolvedValue(null);

    await expect(
      useCase.execute(
        userId,
        'weekly-1',
        { attended_recitation_call: true },
        onRecitationDay,
      ),
    ).rejects.toMatchObject({
      response: { statusCode: 409, error: 'ALREADY_FINALISED' },
    });
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
