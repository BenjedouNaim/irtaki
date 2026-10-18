import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  Max,
  MinLength,
  validateSync,
} from 'class-validator';
import {
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_JOIN_REQUEST_RATE_LIMIT,
} from './rate-limit.config';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @Min(1024)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsString()
  @IsOptional()
  DB_HOST?: string = '127.0.0.1';

  @IsNumber()
  @IsOptional()
  DB_PORT?: number = 5432;

  /**
   * Required, and deliberately without a default (ISS #145). `DB_USER` and
   * `DB_PASS` may default because a wrong credential fails to connect; a wrong
   * database name connects and writes to the wrong database. The integration
   * suite's teardown helpers issue unscoped `DELETE`s, so the default that used
   * to sit here pointed them at a working database.
   */
  @IsString()
  @Matches(/\S/, {
    message: 'DB_NAME is required and must not be blank (no default)',
  })
  DB_NAME!: string;

  @IsString()
  @IsOptional()
  DB_USER?: string = 'irtaki';

  @IsString()
  @IsOptional()
  DB_PASS?: string = 'irtaki';

  @IsString()
  @MinLength(16)
  @IsOptional()
  JWT_ACCESS_SECRET: string =
    'dev-secret-key-must-be-changed-in-prod-min-32-chars';

  @IsString()
  @MinLength(16)
  @IsOptional()
  JWT_REFRESH_PEPPER: string =
    'dev-pepper-key-must-be-changed-in-prod-min-32-chars';

  @IsString()
  @IsOptional()
  MAILGUN_API_KEY?: string;

  @IsString()
  @IsOptional()
  MAILGUN_DOMAIN?: string;

  @IsString()
  @IsOptional()
  FCM_SERVICE_ACCOUNT_JSON?: string;

  @IsString()
  @IsOptional()
  CENTER_TIMEZONE: string = 'Africa/Tunis';

  @IsIn(['true', 'false'])
  @IsOptional()
  HEALTHCHECKS_ENABLED: string = 'true';

  /**
   * One ping URL per scheduled job, required in production while monitoring
   * is enabled. HEALTHCHECKS_ENABLED=false disables monitoring, not the jobs.
   * Outside production, an unset URL skips that job's ping with a warning.
   */
  @IsString()
  @IsOptional()
  HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION?: string;

  @IsString()
  @IsOptional()
  HEALTHCHECKS_PING_URL_DAILY_REMINDER_EVALUATION?: string;

  @IsString()
  @IsOptional()
  HEALTHCHECKS_PING_URL_AT_RISK_EVALUATION?: string;

  @IsString()
  @IsOptional()
  HEALTHCHECKS_PING_URL_PAYMENT_DUE_SOON_EVALUATION?: string;

  @IsString()
  @IsOptional()
  HEALTHCHECKS_PING_URL_COVERAGE_RECONCILIATION?: string;

  /**
   * Rate limiting (APIS §9.8, NFR-22). SAS §3201 records the numeric
   * target as undefined, so `rate-limit.config.ts` ships conservative
   * defaults and these keys let an environment tune them without a code
   * change (TS §32). Both count requests per 60-second window.
   */
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_AUTH_PER_MINUTE: number = DEFAULT_AUTH_RATE_LIMIT;

  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_JOIN_REQUESTS_PER_MINUTE: number = DEFAULT_JOIN_REQUEST_RATE_LIMIT;
}

/**
 * TS §31's dead-man's-switch list, verbatim: "every scheduled job
 * (`WeeklyReportFinalizationJob`, `CoverageReconciliationJob`,
 * `DailyReminderEvaluationJob`, `AtRiskEvaluationJob`,
 * `PaymentDueSoonEvaluationJob`) pings on success; a missed ping alerts".
 * Five jobs, five `HEALTHCHECKS_PING_URL_*` variables — the list production
 * boot validates against when monitoring is enabled.
 */
export const HEALTHCHECKS_PING_URL_KEYS = [
  'HEALTHCHECKS_PING_URL_WEEKLY_REPORT_FINALIZATION',
  'HEALTHCHECKS_PING_URL_DAILY_REMINDER_EVALUATION',
  'HEALTHCHECKS_PING_URL_AT_RISK_EVALUATION',
  'HEALTHCHECKS_PING_URL_PAYMENT_DUE_SOON_EVALUATION',
  'HEALTHCHECKS_PING_URL_COVERAGE_RECONCILIATION',
] as const;

/**
 * Validates environment configuration at boot time (TS §32).
 * Fails fast before the server starts accepting HTTP traffic.
 */
export function validate(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors.map((err) => {
      const constraints = err.constraints
        ? Object.values(err.constraints).join(', ')
        : 'invalid';
      return ` - ${err.property}: ${constraints}`;
    });
    throw new Error(
      `\n[ConfigModule] Environment validation failed:\n${errorMessages.join('\n')}\n`,
    );
  }

  // In production, enforce that critical secrets and parameters are explicitly supplied
  if (validatedConfig.NODE_ENV === Environment.Production) {
    const missingProdKeys: string[] = [];
    if (!validatedConfig.DATABASE_URL && !validatedConfig.DB_HOST) {
      missingProdKeys.push('DATABASE_URL or DB_HOST');
    }
    if (
      !validatedConfig.JWT_ACCESS_SECRET ||
      validatedConfig.JWT_ACCESS_SECRET ===
        'dev-secret-key-must-be-changed-in-prod-min-32-chars'
    ) {
      missingProdKeys.push('JWT_ACCESS_SECRET (production value required)');
    }
    if (
      !validatedConfig.JWT_REFRESH_PEPPER ||
      validatedConfig.JWT_REFRESH_PEPPER ===
        'dev-pepper-key-must-be-changed-in-prod-min-32-chars'
    ) {
      missingProdKeys.push('JWT_REFRESH_PEPPER (production value required)');
    }
    // Require monitoring for every job unless this deployment explicitly opts out.
    if (validatedConfig.HEALTHCHECKS_ENABLED !== 'false') {
      for (const key of HEALTHCHECKS_PING_URL_KEYS) {
        if (!validatedConfig[key]) {
          missingProdKeys.push(
            `${key} (dead-man's-switch for the matching scheduled job, TS §31/§32)`,
          );
        }
      }
    }

    if (missingProdKeys.length > 0) {
      throw new Error(
        `\n[ConfigModule] Production environment validation failed. Missing required production keys:\n${missingProdKeys.map((k) => ` - ${k}`).join('\n')}\n`,
      );
    }
  }

  return validatedConfig;
}
