import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root (`e2e/src/support` → `../../..`). */
export const REPO_ROOT = path.resolve(here, '../../..');

/**
 * Everything the suite needs from its surroundings. All values have local
 * defaults matching `e2e/README.md`; CI overrides them through the environment.
 */
export const env = {
  /** API the app under test was built against (EXPO_PUBLIC_API_BASE_URL). */
  apiUrl: process.env.E2E_API_URL ?? 'http://localhost:3847/api/v1',

  /** Dedicated E2E database — never the development `irtaki` database. */
  db: {
    host: process.env.E2E_DB_HOST ?? 'localhost',
    port: Number(process.env.E2E_DB_PORT ?? 5432),
    user: process.env.E2E_DB_USER ?? 'irtaki',
    password: process.env.E2E_DB_PASS ?? 'irtaki',
    database: process.env.E2E_DB_NAME ?? 'irtaki_e2e',
  },

  /** Backend checkout used to run scheduled jobs (`dist/src/cli/run-job.js`). */
  backendDir: process.env.E2E_BACKEND_DIR ?? path.join(REPO_ROOT, 'backend'),

  /** Password of the seeded staff accounts (`backend/seed/run-seed.ts`). */
  seedPassword: process.env.SEED_PASSWORD ?? 'password123',

  /** The center's timezone; fixtures register users in it. */
  timezone: process.env.E2E_TIMEZONE ?? 'Africa/Tunis',

  /** Unique per run so parallel or repeated runs never collide on names/emails. */
  runId:
    process.env.E2E_RUN_ID ??
    Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36),
};

if (env.db.database === 'irtaki') {
  throw new Error(
    'E2E_DB_NAME must not be the development database `irtaki` — use irtaki_e2e.',
  );
}
