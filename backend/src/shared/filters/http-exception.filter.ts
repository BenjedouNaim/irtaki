import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getCorrelationId } from '../middleware/correlation-id.middleware';

export interface ValidationErrorDetail {
  field: string;
  rule?: string;
  message: string;
}

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details?: ValidationErrorDetail[];
  /**
   * `409 DUPLICATE_REPORT` only (APIS §9.7 / §12, APIQ-09): the already
   * persisted report, so a retried `POST /daily-reports` is a safe no-op.
   */
  existing_report?: Record<string, unknown>;
  correlationId: string;
}

const DEFAULT_ERROR_MESSAGES: Record<
  number,
  { error: string; message: string }
> = {
  [HttpStatus.BAD_REQUEST]: {
    error: 'BAD_REQUEST',
    message: 'طلب غير صالح',
  },
  [HttpStatus.UNAUTHORIZED]: {
    error: 'UNAUTHORIZED',
    message: 'غير مصرح به أو انتهت صلاحية الجلسة',
  },
  [HttpStatus.FORBIDDEN]: {
    error: 'SCOPE_DENIED',
    message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
  },
  [HttpStatus.NOT_FOUND]: {
    error: 'NOT_FOUND',
    message: 'المورد المطلوب غير موجود',
  },
  [HttpStatus.CONFLICT]: {
    error: 'CONFLICT',
    message: 'تعارض في حالة المورد',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    error: 'VALIDATION_ERROR',
    message: 'فشل التحقق من صحة البيانات المدخلة',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    error: 'RATE_LIMITED',
    message: 'تم تجاوز الحد المسموح به من الطلبات، يرجى المحاولة لاحقاً',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    error: 'SERVICE_UNAVAILABLE',
    message: 'الخدمة غير متوفرة حالياً، يرجى المحاولة لاحقاً',
  },
  [HttpStatus.INTERNAL_SERVER_ERROR]: {
    error: 'INTERNAL_ERROR',
    message: 'حدث خطأ داخلي غير متوقع في الخادم',
  },
};

/**
 * Normalizes error strings to SCREAMING_SNAKE_CASE machine-readable codes.
 */
function normalizeErrorCode(error: string, status: number): string {
  if (DEFAULT_ERROR_MESSAGES[status] && DEFAULT_ERROR_MESSAGES[status].error) {
    const trimmed = error.trim().toLowerCase();
    if (
      trimmed === 'forbidden' ||
      trimmed === 'unprocessable entity' ||
      trimmed === 'bad request' ||
      trimmed === 'not found' ||
      trimmed === 'unauthorized' ||
      trimmed === 'conflict' ||
      trimmed === 'too many requests' ||
      trimmed === 'internal server error'
    ) {
      return DEFAULT_ERROR_MESSAGES[status].error;
    }
  }
  return error
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Global Exception Filter (APIS §9.5, SA §24, TS §29).
 *
 * Enforces the unified error contract across all endpoints:
 *  - Sanitizes unexpected errors (no stack trace, no Postgres/DB errors leak).
 *  - Attaches the active `correlationId`.
 *  - Includes `details` array only on 422 Unprocessable Entity.
 *  - Ensures user-facing message is always present.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string }>();

    const correlationId =
      request?.correlationId || getCorrelationId() || 'unknown-correlation-id';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_ERROR';
    let errorMessage =
      DEFAULT_ERROR_MESSAGES[HttpStatus.INTERNAL_SERVER_ERROR].message;
    let details: ValidationErrorDetail[] | undefined;
    let existingReport: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      const defaultMapping = DEFAULT_ERROR_MESSAGES[status] || {
        error: 'HTTP_ERROR',
        message: exception.message,
      };
      errorCode = defaultMapping.error;
      errorMessage = defaultMapping.message;

      if (typeof res === 'string') {
        errorMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const responseObj = res as Record<string, unknown>;

        if (
          typeof responseObj.error === 'string' &&
          responseObj.error.trim().length > 0
        ) {
          errorCode = normalizeErrorCode(responseObj.error, status);
        }

        if (
          typeof responseObj.message === 'string' &&
          responseObj.message.trim().length > 0
        ) {
          errorMessage = responseObj.message;
        } else if (Array.isArray(responseObj.message)) {
          // Handle NestJS default ValidationPipe messages array
          if (
            status === HttpStatus.UNPROCESSABLE_ENTITY ||
            status === HttpStatus.BAD_REQUEST
          ) {
            details = this.formatValidationMessages(responseObj.message);
            errorMessage =
              typeof responseObj.error === 'string'
                ? responseObj.error
                : defaultMapping.message;
          }
        }

        if (Array.isArray(responseObj.details)) {
          details = responseObj.details as ValidationErrorDetail[];
        }

        if (
          typeof responseObj.existing_report === 'object' &&
          responseObj.existing_report !== null &&
          !Array.isArray(responseObj.existing_report)
        ) {
          existingReport = responseObj.existing_report as Record<
            string,
            unknown
          >;
        }
      }
    } else {
      // Non-HttpException / unexpected error: Log full internal details with correlationId
      this.logger.error(
        {
          correlationId,
          path: request?.url,
          method: request?.method,
          err: exception instanceof Error ? exception.stack : exception,
        },
        'Unhandled server exception',
      );
    }

    // Build the standardized error envelope
    const envelope: ErrorEnvelope = {
      statusCode: status,
      error: errorCode,
      message: errorMessage,
      correlationId,
    };

    // Details must strictly appear ONLY on 422
    if (
      status === HttpStatus.UNPROCESSABLE_ENTITY &&
      details &&
      details.length > 0
    ) {
      envelope.details = details;
    }

    // The existing report rides only on a 409 (APIQ-09); never on any other status.
    if (status === HttpStatus.CONFLICT && existingReport) {
      envelope.existing_report = existingReport;
    }

    response.status(status).json(envelope);
  }

  private formatValidationMessages(
    messages: unknown[],
  ): ValidationErrorDetail[] {
    const details: ValidationErrorDetail[] = [];

    for (const msg of messages) {
      if (typeof msg === 'string') {
        const parts = msg.split(' ');
        const field = parts[0] || 'unknown';
        details.push({
          field,
          message: msg,
        });
      } else if (typeof msg === 'object' && msg !== null) {
        const item = msg as Record<string, unknown>;
        details.push({
          field: typeof item.field === 'string' ? item.field : 'unknown',
          rule: typeof item.rule === 'string' ? item.rule : undefined,
          message:
            typeof item.message === 'string'
              ? item.message
              : JSON.stringify(item),
        });
      }
    }

    return details;
  }
}
