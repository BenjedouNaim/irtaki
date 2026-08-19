import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import pino, { Logger as PinoLogger, LoggerOptions } from 'pino';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

/**
 * Structured Logging Service based on Pino (ADR-033, TS §30).
 *
 * Rules:
 *  - Structured JSON format in production.
 *  - Automatic redaction of sensitive credentials and tokens.
 *  - Automatic injection of `correlationId` into all log records.
 *  - Implements NestJS LoggerService interface.
 */
@Injectable()
export class PinoLoggerService implements NestLoggerService {
  private readonly logger: PinoLogger;

  constructor() {
    const isDev = process.env.NODE_ENV === 'development';
    const isTest = process.env.NODE_ENV === 'test';

    const pinoOptions: LoggerOptions = {
      level: isTest ? 'silent' : isDev ? 'debug' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers["authorization"]',
          'authorization',
          'password',
          'password_hash',
          'passwordHash',
          'token',
          'access_token',
          'accessToken',
          'refresh_token',
          'refreshToken',
          '*.password',
          '*.password_hash',
          '*.passwordHash',
          '*.token',
          '*.access_token',
          '*.accessToken',
          '*.refresh_token',
          '*.refreshToken',
        ],
        censor: '[REDACTED]',
      },
      formatters: {
        log: (object) => {
          const correlationId = getCorrelationId();
          if (correlationId && !object.correlationId) {
            return { correlationId, ...object };
          }
          return object;
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    };

    if (isDev && !isTest) {
      this.logger = pino({
        ...pinoOptions,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      });
    } else {
      this.logger = pino(pinoOptions);
    }
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.callPino('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.callPino('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.callPino('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.callPino('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.callPino('trace', message, optionalParams);
  }

  private callPino(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    params: unknown[],
  ): void {
    const correlationId = getCorrelationId();
    const context =
      params.length > 0 && typeof params[params.length - 1] === 'string'
        ? (params.pop() as string)
        : undefined;

    let payload: Record<string, unknown> = {};
    if (correlationId) {
      payload.correlationId = correlationId;
    }
    if (context) {
      payload.context = context;
    }

    if (typeof message === 'object' && message !== null) {
      payload = { ...payload, ...message };
      this.logger[level](payload);
    } else {
      if (params.length > 0) {
        payload.extra = params;
      }
      this.logger[level](payload, String(message));
    }
  }
}
