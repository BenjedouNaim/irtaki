import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { env } from '../support/env.js';

const run = promisify(execFile);

export type JobName =
  | 'weekly-report-finalization'
  | 'daily-reminder-evaluation'
  | 'at-risk-evaluation'
  | 'payment-due-soon-evaluation'
  | 'coverage-reconciliation';

/**
 * Run one backend scheduled job at an explicit instant through
 * `backend/src/cli/run-job.ts` (compiled to dist). The crons tick on wall-clock
 * time; this lets a test say "it is now past midnight" without waiting.
 */
export async function runJob(name: JobName, now: Date = new Date()): Promise<unknown> {
  const script = path.join(env.backendDir, 'dist/src/cli/run-job.js');
  if (!existsSync(script)) {
    throw new Error(`${script} not found — run \`npm run build\` in backend/ first.`);
  }
  const { stdout } = await run('node', [script, name, `--now=${now.toISOString()}`], {
    cwd: env.backendDir,
    env: {
      ...process.env,
      DB_HOST: env.db.host,
      DB_PORT: String(env.db.port),
      DB_USER: env.db.user,
      DB_PASS: env.db.password,
      DB_NAME: env.db.database,
    },
    timeout: 120_000,
  });
  const line = stdout
    .split('\n')
    .reverse()
    .find((l) => l.startsWith('{"job"'));
  if (!line) throw new Error(`run-job ${name} printed no result:\n${stdout}`);
  return (JSON.parse(line) as { outcome: unknown }).outcome;
}
