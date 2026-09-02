/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import { DailyReportSubmittedEvent } from '../../../reports/domain/events/daily-report-submitted.event';
import { DailyReportSubmittedListener } from './daily-report-submitted.listener';
import { UpdateCoverageUseCase } from './update-coverage.use-case';

describe('DailyReportSubmittedListener (DE-05 subscription)', () => {
  let listener: DailyReportSubmittedListener;
  let updateCoverageUseCase: jest.Mocked<
    Pick<UpdateCoverageUseCase, 'execute'>
  >;

  const event = new DailyReportSubmittedEvent(
    'membership-1',
    '2026-09-02',
    'Normal',
    {
      start: { surah: 1, ayah: 1, ordinal: 1 },
      end: { surah: 1, ayah: 7, ordinal: 7 },
    },
  );

  beforeEach(() => {
    updateCoverageUseCase = { execute: jest.fn() };
    listener = new DailyReportSubmittedListener(
      updateCoverageUseCase as unknown as UpdateCoverageUseCase,
    );
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is bound to the DE-05 event name', () => {
    const metadata = Reflect.getMetadata(
      'EVENT_LISTENER_METADATA',
      DailyReportSubmittedListener.prototype.handle,
    ) as Array<{ event: string }> | undefined;

    expect(metadata).toBeDefined();
    expect(metadata?.map((m) => m.event)).toContain('daily-report.submitted');
  });

  it('forwards the event to UpdateCoverageUseCase', async () => {
    updateCoverageUseCase.execute.mockResolvedValue({
      status: 'skipped',
      reason: 'NO_MEMO_RANGE',
    });

    await listener.handle(event);

    expect(updateCoverageUseCase.execute).toHaveBeenCalledWith(event);
  });

  it('swallows and logs failures so the emitter is never affected (ADR-032)', async () => {
    updateCoverageUseCase.execute.mockRejectedValue(new Error('boom'));

    await expect(listener.handle(event)).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });
});
