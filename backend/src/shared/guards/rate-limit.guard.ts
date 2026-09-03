import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * `429` rate-limit guard (APIS §9.8, TS §16, NFR-22).
 *
 * Applied per route — never globally — because APIS §9.8 is explicit that
 * "no other endpoint is throttled for MVP": `/auth/*` and
 * `POST /join-requests` are the whole list. The two named throttlers are
 * declared in `rate-limit.config.ts`; each route skips the one that does
 * not belong to it via `@SkipThrottle`.
 *
 * The only behaviour overridden here is the response: `@nestjs/throttler`
 * raises an English `ThrottlerException`, while APIS §9.5 requires the
 * standard envelope with `error: "RATE_LIMITED"` and an Arabic,
 * user-facing `message` (API-X06). The global `HttpExceptionFilter`
 * attaches `correlationId`.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected throwThrottlingException(): Promise<void> {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'RATE_LIMITED',
        message: 'تم تجاوز الحد المسموح به من الطلبات، يرجى المحاولة لاحقاً',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
