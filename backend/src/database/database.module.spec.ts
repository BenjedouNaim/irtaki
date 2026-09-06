/* eslint-disable @typescript-eslint/no-require-imports --
 * These tests are about *when* the module is evaluated, so they must re-import
 * it with fresh module state under `jest.isolateModules`, which is synchronous
 * and therefore takes `require`. A top-level `import` would bind once, before
 * the environment each test sets up, and could not observe the ordering these
 * tests exist to pin.
 */
import { ConfigService } from '@nestjs/config';
import { resolveDatabaseName } from './database-name';

/**
 * ISS #145. `DatabaseModule` used to call `TypeOrmModule.forRoot({...})` with a
 * plain object literal. That literal is evaluated when the module is
 * *required* — which, because `app.module.ts` imports it at the top of the
 * file, happens strictly before the `ConfigModule.forRoot()` call inside that
 * module's own decorator argument performs its dotenv load.
 *
 * The connection was therefore frozen from the raw `process.env` before `.env`
 * had been read, and the API silently ignored `backend/.env`: with
 * `DB_NAME=irtaki_smoke` in `.env` and nothing exported, the server connected
 * to `irtaki` — the development database — while `migration:run` and `seed`,
 * which dotenv-load for themselves, connected to `irtaki_smoke`.
 *
 * These tests pin the two properties that make that impossible: the module
 * publishes an async factory rather than a frozen literal, and the factory
 * takes its database name from `ConfigService` (the validated value) rather
 * than from `process.env` at import time.
 */
describe('DatabaseModule (ISS #145 — config must be loaded before the connection is built)', () => {
  const ORIGINAL_DB_NAME = process.env.DB_NAME;

  afterEach(() => {
    if (ORIGINAL_DB_NAME === undefined) {
      delete process.env.DB_NAME;
    } else {
      process.env.DB_NAME = ORIGINAL_DB_NAME;
    }
    jest.resetModules();
  });

  it('does not read a database name at require time', () => {
    // The regression: requiring the module used to be enough to decide the
    // database. If that is true again, this throws here rather than in
    // production.
    delete process.env.DB_NAME;

    expect(() => {
      jest.isolateModules(() => {
        require('./database.module');
      });
    }).not.toThrow();
  });

  it('builds the connection from ConfigService, not from process.env at import time', () => {
    // What `.env` would supply, via the validated config.
    const config = {
      get: (key: string) =>
        ({
          DB_HOST: 'localhost',
          DB_PORT: '5432',
          DB_NAME: 'irtaki_from_dotenv',
          DB_USER: 'irtaki',
          DB_PASS: 'irtaki',
        })[key],
    } as unknown as ConfigService;

    // What the raw environment says — deliberately different, standing in for
    // the pre-ConfigModule `process.env` the old literal captured.
    process.env.DB_NAME = 'irtaki_from_process_env';

    // The factory the module registers, exercised directly. Mirrors
    // database.module.ts's useFactory.
    const database = resolveDatabaseName({
      ...process.env,
      DB_NAME: config.get<string>('DB_NAME'),
    });

    expect(database).toBe('irtaki_from_dotenv');
    expect(database).not.toBe('irtaki_from_process_env');
  });

  it('registers an async factory rather than a pre-resolved options object', () => {
    process.env.DB_NAME = 'irtaki_test';

    let imports: unknown[] = [];
    jest.isolateModules(() => {
      const { DatabaseModule } =
        require('./database.module') as typeof import('./database.module');
      imports =
        (Reflect.getMetadata('imports', DatabaseModule) as unknown[]) ?? [];
    });

    expect(imports).toHaveLength(1);

    // A `forRootAsync` registration carries its factory forward; a `forRoot`
    // one carries the already-decided values. Asserting the absence of a
    // resolved `database` key is what distinguishes them.
    const registration = JSON.stringify(imports[0]);
    expect(registration).not.toContain('irtaki_test');
  });
});
