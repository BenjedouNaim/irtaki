import { Logger } from '@nestjs/common';
import { getCorrelationId } from '../../../../shared/middleware/correlation-id.middleware';
import { HealthchecksPingService } from '../../../../shared/observability/healthchecks-ping.service';
import {
  ADR_030_TICK_CRON_EXPRESSION,
  DAILY_JOB_CRON_EXPRESSION,
} from '../../../../shared/scheduling/scheduled-job';
import { WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION } from '../../../reports/infrastructure/jobs/weekly-report-finalization.job';
import { AtRiskEvaluator } from '../../application/evaluators/at-risk.evaluator';
import { DailyReminderEvaluator } from '../../application/evaluators/daily-reminder.evaluator';
import { PaymentDueSoonEvaluator } from '../../application/evaluators/payment-due-soon.evaluator';
import { WeeklyReportAvailableEvaluator } from '../../application/evaluators/weekly-report-available.evaluator';
import {
  AT_RISK_EVALUATION_CRON,
  AT_RISK_EVALUATION_PING_KEY,
  AtRiskEvaluationJob,
} from './at-risk-evaluation.job';
import {
  DAILY_REMINDER_EVALUATION_CRON,
  DAILY_REMINDER_EVALUATION_PING_KEY,
  DailyReminderEvaluationJob,
} from './daily-reminder-evaluation.job';
import {
  PAYMENT_DUE_SOON_EVALUATION_CRON,
  PAYMENT_DUE_SOON_EVALUATION_PING_KEY,
  PaymentDueSoonEvaluationJob,
} from './payment-due-soon-evaluation.job';

const NOTHING = { candidates: 0, triggered: 0, sent: 0 };

describe('The Notifications module scheduled jobs (SA §23, ADR-024)', () => {
  let healthchecks: jest.Mocked<Pick<HealthchecksPingService, 'pingSuccess'>>;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    healthchecks = { pingSuccess: jest.fn().mockResolvedValue('pinged') };
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function dailyReminderJob(
    reminder = jest.fn().mockResolvedValue(NOTHING),
    weekly = jest.fn().mockResolvedValue(NOTHING),
  ): DailyReminderEvaluationJob {
    return new DailyReminderEvaluationJob(
      { evaluate: reminder } as unknown as DailyReminderEvaluator,
      { evaluate: weekly } as unknown as WeeklyReportAvailableEvaluator,
      healthchecks as unknown as HealthchecksPingService,
    );
  }

  describe('cron definitions', () => {
    it('puts the student-local job on ADR-030s single 15-minute tick', () => {
      expect(ADR_030_TICK_CRON_EXPRESSION).toBe('0 */15 * * * *');
      expect(DAILY_REMINDER_EVALUATION_CRON).toBe('daily-reminder-evaluation');
    });

    it('shares that tick definition with WeeklyReportFinalizationJob', () => {
      // The F-WR-02 job is not rebuilt; it rides the same constant, which
      // is what "the same scheduler infrastructure" means structurally.
      expect(WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION).toBe(
        ADR_030_TICK_CRON_EXPRESSION,
      );
    });

    it('puts the two daily jobs on the server-clock day boundary', () => {
      expect(DAILY_JOB_CRON_EXPRESSION).toBe('0 0 0 * * *');
      expect(AT_RISK_EVALUATION_CRON).toBe('at-risk-evaluation');
      expect(PAYMENT_DUE_SOON_EVALUATION_CRON).toBe(
        'payment-due-soon-evaluation',
      );
    });

    it('gives every job its own Healthchecks.io key (TS §32)', () => {
      expect(
        new Set([
          DAILY_REMINDER_EVALUATION_PING_KEY,
          AT_RISK_EVALUATION_PING_KEY,
          PAYMENT_DUE_SOON_EVALUATION_PING_KEY,
        ]).size,
      ).toBe(3);
    });
  });

  describe('DailyReminderEvaluationJob', () => {
    it('runs both student-local evaluators on one tick and pings on success', async () => {
      const now = new Date('2026-09-07T19:00:00.000Z');
      const reminder = jest
        .fn()
        .mockResolvedValue({ candidates: 4, triggered: 2, sent: 2 });
      const weekly = jest.fn().mockResolvedValue(NOTHING);

      const outcome = await dailyReminderJob(reminder, weekly).run(now);

      expect(reminder).toHaveBeenCalledWith(now, 15);
      expect(weekly).toHaveBeenCalledWith(now, 15);
      expect(outcome).toEqual({
        reminder: { candidates: 4, triggered: 2, sent: 2 },
        weeklyAvailable: NOTHING,
      });
      expect(healthchecks.pingSuccess).toHaveBeenCalledWith(
        DAILY_REMINDER_EVALUATION_PING_KEY,
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('DailyReminderEvaluationJob succeeded'),
      );
    });

    it('opens a correlationId context for the run (TS §30)', async () => {
      let seen: string | undefined;
      const reminder = jest.fn().mockImplementation(() => {
        seen = getCorrelationId();
        return Promise.resolve(NOTHING);
      });

      await dailyReminderJob(reminder).run(new Date());

      expect(seen).toEqual(expect.any(String));
    });

    it('logs ERROR, skips the ping and never throws when a sweep fails', async () => {
      const reminder = jest
        .fn()
        .mockRejectedValue(new Error('postgres unreachable'));

      await expect(
        dailyReminderJob(reminder).run(new Date()),
      ).resolves.toBeNull();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DailyReminderEvaluationJob failed'),
        expect.stringContaining('postgres unreachable'),
      );
      expect(healthchecks.pingSuccess).not.toHaveBeenCalled();
    });

    it('skips an overlapping tick with a WARN rather than running twice', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reminder = jest.fn().mockImplementation(async () => {
        await gate;
        return NOTHING;
      });

      const job = dailyReminderJob(reminder);
      const first = job.run(new Date());
      const second = await job.run(new Date());

      expect(second).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('tick skipped'),
      );
      release();
      await first;
      expect(reminder).toHaveBeenCalledTimes(1);
    });
  });

  describe('AtRiskEvaluationJob', () => {
    it('runs the N-07 sweep against the given clock and pings on success', async () => {
      const now = new Date('2026-09-07T00:00:00.000Z');
      const evaluate = jest
        .fn()
        .mockResolvedValue({ candidates: 9, triggered: 1, sent: 1 });
      const job = new AtRiskEvaluationJob(
        { evaluate } as unknown as AtRiskEvaluator,
        healthchecks as unknown as HealthchecksPingService,
      );

      const outcome = await job.run(now);

      expect(evaluate).toHaveBeenCalledWith(now);
      expect(outcome).toEqual({ candidates: 9, triggered: 1, sent: 1 });
      expect(healthchecks.pingSuccess).toHaveBeenCalledWith(
        AT_RISK_EVALUATION_PING_KEY,
      );
    });
  });

  describe('PaymentDueSoonEvaluationJob', () => {
    it('runs the N-06 sweep against the given clock and pings on success', async () => {
      const now = new Date('2026-11-25T00:00:00.000Z');
      const evaluate = jest
        .fn()
        .mockResolvedValue({ candidates: 9, triggered: 3, sent: 3 });
      const job = new PaymentDueSoonEvaluationJob(
        { evaluate } as unknown as PaymentDueSoonEvaluator,
        healthchecks as unknown as HealthchecksPingService,
      );

      const outcome = await job.run(now);

      expect(evaluate).toHaveBeenCalledWith(now);
      expect(outcome).toEqual({ candidates: 9, triggered: 3, sent: 3 });
      expect(healthchecks.pingSuccess).toHaveBeenCalledWith(
        PAYMENT_DUE_SOON_EVALUATION_PING_KEY,
      );
    });

    it('never throws and skips the ping when the sweep fails', async () => {
      const evaluate = jest.fn().mockRejectedValue(new Error('boom'));
      const job = new PaymentDueSoonEvaluationJob(
        { evaluate } as unknown as PaymentDueSoonEvaluator,
        healthchecks as unknown as HealthchecksPingService,
      );

      await expect(job.run(new Date())).resolves.toBeNull();
      expect(healthchecks.pingSuccess).not.toHaveBeenCalled();
    });
  });
});
