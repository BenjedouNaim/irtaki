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
});
