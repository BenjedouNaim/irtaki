/* eslint-disable @typescript-eslint/unbound-method */
import { Logger } from '@nestjs/common';
import { getCorrelationId } from '../../../../shared/middleware/correlation-id.middleware';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import { WeeklyReportFinalizationService } from '../../application/finalise-weekly-reports/weekly-report-finalization.service';
import {
  WEEKLY_REPORT_FINALIZATION_CRON,
  WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION,
  WEEKLY_REPORT_FINALIZATION_PING_KEY,
  WeeklyReportFinalizationJob,
} from './weekly-report-finalization.job';

describe('WeeklyReportFinalizationJob (ADR-024 / ADR-030, TS §30-31)', () => {
  let job: WeeklyReportFinalizationJob;
  let service: jest.Mocked<
    Pick<WeeklyReportFinalizationService, 'finaliseOverdue'>
  >;
  let healthchecks: jest.Mocked<Pick<HealthchecksPingService, 'pingSuccess'>>;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    service = { finaliseOverdue: jest.fn() };
    healthchecks = { pingSuccess: jest.fn().mockResolvedValue('pinged') };
    job = new WeeklyReportFinalizationJob(
      service as unknown as WeeklyReportFinalizationService,
      healthchecks as unknown as HealthchecksPingService,
    );
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ticks every 15 minutes on the server clock — ADR-030 single tick, per-timezone filtering in DS-02', () => {
    expect(WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION).toBe('0 */15 * * * *');
    expect(WEEKLY_REPORT_FINALIZATION_CRON).toBe('weekly-report-finalization');
    // The decorator metadata @nestjs/schedule reads at bootstrap.
    const metadataKeys = Reflect.getMetadataKeys(
      WeeklyReportFinalizationJob.prototype.tick,
    );
    expect(metadataKeys.length).toBeGreaterThan(0);
  });

  it('runs DS-02 against the given clock, logs the outcome at INFO and pings Healthchecks.io on success', async () => {
    const now = new Date('2026-09-04T23:30:00.000Z');
    service.finaliseOverdue.mockResolvedValue({ candidates: 3, finalised: 2 });

    const outcome = await job.run(now);

    expect(service.finaliseOverdue).toHaveBeenCalledWith(now);
    expect(outcome).toEqual({ candidates: 3, finalised: 2 });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^WeeklyReportFinalizationJob succeeded: finalised 2 of 3 open weekly report\(s\) in \d+ms$/,
      ),
    );
    expect(healthchecks.pingSuccess).toHaveBeenCalledWith(
      WEEKLY_REPORT_FINALIZATION_PING_KEY,
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a failed run at ERROR, does not ping and never throws', async () => {
    service.finaliseOverdue.mockRejectedValue(new Error('db unreachable'));

    await expect(job.run(new Date())).resolves.toBeNull();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^WeeklyReportFinalizationJob failed after \d+ms: db unreachable$/,
      ),
      expect.any(String),
    );
    expect(healthchecks.pingSuccess).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('skips an overlapping tick with a WARN and runs again once the previous run finished', async () => {
    let release!: () => void;
    service.finaliseOverdue.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ candidates: 0, finalised: 0 });
        }),
    );
    service.finaliseOverdue.mockResolvedValue({ candidates: 0, finalised: 0 });

    const first = job.run(new Date());
    const overlapped = await job.run(new Date());
    expect(overlapped).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'WeeklyReportFinalizationJob tick skipped: the previous run is still in progress',
    );
    expect(service.finaliseOverdue).toHaveBeenCalledTimes(1);

    release();
    await first;
    await job.run(new Date());
    expect(service.finaliseOverdue).toHaveBeenCalledTimes(2);
  });

  it('runs each tick inside its own correlationId context so every log line carries one (TS §30, SA §26)', async () => {
    const seen: Array<string | undefined> = [];
    service.finaliseOverdue.mockImplementation(() => {
      seen.push(getCorrelationId());
      return Promise.resolve({ candidates: 0, finalised: 0 });
    });

    await job.run(new Date());
    await job.run(new Date());

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0]).not.toBe(seen[1]);
    expect(getCorrelationId()).toBeUndefined();
  });

  it('tick() delegates to run() with the current clock', async () => {
    service.finaliseOverdue.mockResolvedValue({ candidates: 0, finalised: 0 });
    const before = Date.now();

    await job.tick();

    const now = service.finaliseOverdue.mock.calls[0][0] as Date;
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
