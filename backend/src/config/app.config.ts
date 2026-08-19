import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  MinLength,
  validateSync,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  DB_NAME?: string = 'irtaki';

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
}

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

    if (missingProdKeys.length > 0) {
      throw new Error(
        `\n[ConfigModule] Production environment validation failed. Missing required production keys:\n${missingProdKeys.map((k) => ` - ${k}`).join('\n')}\n`,
      );
    }
  }

  return validatedConfig;
}
