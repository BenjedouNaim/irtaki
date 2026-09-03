import { Environment, validate } from './app.config';

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
      JWT_ACCESS_SECRET: 'dev-secret-key-must-be-changed-in-prod-min-32-chars',
      JWT_REFRESH_PEPPER: 'dev-pepper-key-must-be-changed-in-prod-min-32-chars',
    };

    expect(() => validate(prodConfigMissingSecrets)).toThrow(
      /Production environment validation failed/,
    );
  });

  describe('HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION (TS §32 Required)', () => {
    const prodConfig = {
      NODE_ENV: Environment.Production,
      PORT: '3000',
      DB_HOST: 'db',
      JWT_ACCESS_SECRET: 'a-real-production-access-secret-32-chars-long',
      JWT_REFRESH_PEPPER: 'a-real-production-refresh-pepper-32-chars-long',
    };

    it('fails fast in production when the ping URL is unset', () => {
      expect(() => validate(prodConfig)).toThrow(
        /HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION/,
      );
    });

    it('boots in production once the ping URL is supplied', () => {
      const result = validate({
        ...prodConfig,
        HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION:
          'https://hc-ping.com/00000000-0000-0000-0000-000000000000',
      });
      expect(result.HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION).toBe(
        'https://hc-ping.com/00000000-0000-0000-0000-000000000000',
      );
    });

    it('stays optional outside production (the ping is skipped with a WARN)', () => {
      const result = validate({ NODE_ENV: Environment.Development });
      expect(
        result.HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION,
      ).toBeUndefined();
    });
  });
});
