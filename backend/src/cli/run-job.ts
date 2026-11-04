import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../app.module';
import { PinoLoggerService } from '../shared';
import { AtRiskEvaluationJob } from '../modules/notifications/infrastructure/jobs/at-risk-evaluation.job';
import { DailyReminderEvaluationJob } from '../modules/notifications/infrastructure/jobs/daily-reminder-evaluation.job';
import { PaymentDueSoonEvaluationJob } from '../modules/notifications/infrastructure/jobs/payment-due-soon-evaluation.job';
import { CoverageReconciliationJob } from '../modules/progress/infrastructure/jobs/coverage-reconciliation.job';
import { WeeklyReportFinalizationJob } from '../modules/reports/infrastructure/jobs/weekly-report-finalization.job';

/**
 * Runs one scheduled job on demand, optionally at an explicit instant:
 *
 *   node dist/src/cli/run-job weekly-report-finalization --now=2026-09-15T00:05:00+01:00
 *
 * The five jobs only run on their cron (ADR-030), and the HTTP path always uses
 * wall-clock time, so the Appium end-to-end suite (`e2e/`) drives
 * time-dependent behaviour through this script instead of waiting for a tick.
 * It is a CLI, not a route: nothing here is reachable over HTTP.
 *
 * Refuses to run in production — a `--now` in the future would finalise real
 * weeks or send real notifications early.
 */
const JOB_NAMES = [
  'weekly-report-finalization',
  'daily-reminder-evaluation',
  'at-risk-evaluation',
  'payment-due-soon-evaluation',
  'coverage-reconciliation',
] as const;

type JobName = (typeof JOB_NAMES)[number];

function isJobName(value: string): value is JobName {
  return (JOB_NAMES as readonly string[]).includes(value);
}

function runJob(
  app: INestApplicationContext,
  name: JobName,
  now: Date,
): Promise<object | null> {
  switch (name) {
    case 'weekly-report-finalization':
      return app.get(WeeklyReportFinalizationJob).run(now);
    case 'daily-reminder-evaluation':
      return app.get(DailyReminderEvaluationJob).run(now);
    case 'at-risk-evaluation':
      return app.get(AtRiskEvaluationJob).run(now);
    case 'payment-due-soon-evaluation':
      return app.get(PaymentDueSoonEvaluationJob).run(now);
    case 'coverage-reconciliation':
      // Reconciliation is global and has no notion of "now".
      return app.get(CoverageReconciliationJob).run();
  }
}

function parseNow(args: string[]): Date {
  const flag = args.find((arg) => arg.startsWith('--now='));
  if (!flag) return new Date();
  const now = new Date(flag.slice('--now='.length));
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid --now value: ${flag}`);
  }
  return now;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('run-job refuses to run in production.');
    process.exit(1);
  }

  const [name, ...rest] = process.argv.slice(2);
  if (!name || !isJobName(name)) {
    console.error(`Usage: run-job <${JOB_NAMES.join('|')}> [--now=<ISO-8601>]`);
    process.exit(2);
  }
  const now = parseNow(rest);

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLoggerService));

  // The context registers every @Cron; stop them so only the requested run happens.
  for (const [, cron] of app.get(SchedulerRegistry).getCronJobs()) {
    void cron.stop();
  }

  try {
    const outcome = await runJob(app, name, now);
    if (outcome === null) {
      console.error(`${name} did not complete (see logs above).`);
      process.exitCode = 1;
    } else {
      console.log(
        JSON.stringify({ job: name, now: now.toISOString(), outcome }),
      );
    }
  } finally {
    await app.close();
  }
}

void main();
