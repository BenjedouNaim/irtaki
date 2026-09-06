/**
 * The one place `DB_NAME` is read.
 *
 * It has no default. A default here is not a convenience — it is a hazard
 * (ISS #145): `ConfigModule.forRoot()` passes no `envFilePath`, so under
 * `jest --config ./test/jest-e2e.json` the repository `.env` is not loaded. A
 * default therefore silently pointed the whole integration suite at whatever
 * database that default named, and the suite's teardown helpers issue
 * unscoped `DELETE`s. On this repository that emptied a working database's
 * `notification_log` and `audit_entries` before the cause was found.
 *
 * `DB_USER` and `DB_PASS` can keep defaults: a wrong credential fails to
 * connect, loudly and immediately. A wrong database name connects fine and
 * writes to the wrong place, which is why this one must be supplied.
 */
export function resolveDatabaseName(env: NodeJS.ProcessEnv = process.env) {
  const name = env.DB_NAME?.trim();

  if (!name) {
    throw new Error(
      'DB_NAME is required and has no default. Set it in the environment ' +
        '(backend/.env for local runs, the CI job env for CI). Refusing to ' +
        'guess a database name — a wrong guess connects successfully and ' +
        'writes to the wrong database (ISS #145).',
    );
  }

  return name;
}
