import {
  Environment,
  HEALTHCHECKS_PING_URL_KEYS,
  validate,
} from './app.config';

describe('AppConfig Environment Validation', () => {
  it('validates a valid development environment configuration', () => {
    const validConfig = {
      NODE_ENV: Environment.Development,
      PORT: '3000',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'irtaki',
      DB_USER: 'irtaki',
      DB_PASS: 'irtaki',
      JWT_ACCESS_SECRET: 'dev-jwt-access-secret-minimum-32-chars-key',
      JWT_REFRESH_PEPPER: 'dev-jwt-refresh-pepper-minimum-32-chars-key',
    };

    const result = validate(validConfig);
    expect(result.NODE_ENV).toBe(Environment.Development);
    expect(result.PORT).toBe(3000);
  });

  it('fails if PORT is not a number or outside valid range', () => {
    const invalidConfig = {
      PORT: '999999',
    };

    expect(() => validate(invalidConfig)).toThrow(
      /Environment validation failed/,
    );
  });

  it('fails in production mode if required production keys are missing', () => {
    const prodConfigMissingSecrets = {
      NODE_ENV: Environment.Production,
      PORT: '3000',
      DB_HOST: 'localhost',
      // Supplied so this case reaches the production-specific block; a missing
      // DB_NAME is rejected earlier, by the field validators, and is covered by
      // its own tests below.
      DB_NAME: 'irtaki',
      JWT_ACCESS_SECRET: 'dev-secret-key-must-be-changed-in-prod-min-32-chars',
      JWT_REFRESH_PEPPER: 'dev-pepper-key-must-be-changed-in-prod-min-32-chars',
    };

    expect(() => validate(prodConfigMissingSecrets)).toThrow(
      /Production environment validation failed/,
    );
  });

  describe('HEALTHCHECKS_PING_URL_* — one per scheduled job (TS §31/§32 Required)', () => {
    const prodConfig = {
      NODE_ENV: Environment.Production,
      PORT: '3000',
      DB_HOST: 'db',
      DB_NAME: 'irtaki',
      JWT_ACCESS_SECRET: 'a-real-production-access-secret-32-chars-long',
      JWT_REFRESH_PEPPER: 'a-real-production-refresh-pepper-32-chars-long',
    };

    const pingUrls = Object.fromEntries(
      HEALTHCHECKS_PING_URL_KEYS.map((key, index) => [
        key,
        `https://hc-ping.com/0000000${index}-0000-0000-0000-000000000000`,
      ]),
    );

    it('covers all five jobs TS §31 enumerates, and only those', () => {
      expect([...HEALTHCHECKS_PING_URL_KEYS]).toEqual([
        'HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION',
        'HEALTHCHECKS_PING_URL_DAILY_REMINDER_EVALUATION',
        'HEALTHCHECKS_PING_URL_AT_RISK_EVALUATION',
        'HEALTHCHECKS_PING_URL_PAYMENT_DUE_SOON_EVALUATION',
        'HEALTHCHECKS_PING_URL_COVERAGE_RECONCILIATION',
      ]);
    });

    it.each([...HEALTHCHECKS_PING_URL_KEYS])(
      'fails fast in production when %s is unset',
      (missing) => {
        const withOneMissing = { ...prodConfig, ...pingUrls };
        delete (withOneMissing as Record<string, unknown>)[missing];
        expect(() => validate(withOneMissing)).toThrow(new RegExp(missing));
      },
    );

    it('boots in production once every ping URL is supplied', () => {
      const result = validate({ ...prodConfig, ...pingUrls });
      expect(result.HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION).toBe(
        pingUrls.HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION,
      );
      expect(result.HEALTHCHECKS_PING_URL_COVERAGE_RECONCILIATION).toBe(
        pingUrls.HEALTHCHECKS_PING_URL_COVERAGE_RECONCILIATION,
      );
    });

    it('stays optional outside production (the ping is skipped with a WARN)', () => {
      const result = validate({
        NODE_ENV: Environment.Development,
        DB_NAME: 'irtaki',
      });
      for (const key of HEALTHCHECKS_PING_URL_KEYS) {
        expect(result[key]).toBeUndefined();
      }
    });
  });

  // ISS #145: DB_NAME used to default to 'irtaki', so an environment that never
  // set it — notably `jest --config ./test/jest-e2e.json`, which loads no
  // `.env` — connected to the development database and ran the integration
  // suite's unscoped teardown DELETEs against it. The value must be supplied,
  // in every environment, not just production.
  describe('DB_NAME', () => {
    it('refuses to validate when absent, rather than defaulting to a database name', () => {
      expect(() => validate({ NODE_ENV: Environment.Development })).toThrow(
        /DB_NAME/,
      );
    });

    it('refuses an empty or whitespace-only value', () => {
      expect(() =>
        validate({ NODE_ENV: Environment.Development, DB_NAME: '   ' }),
      ).toThrow(/DB_NAME/);
    });

    it('accepts an explicitly supplied name', () => {
      const result = validate({
        NODE_ENV: Environment.Development,
        DB_NAME: 'irtaki_test',
      });
      expect(result.DB_NAME).toBe('irtaki_test');
    });
  });
});
