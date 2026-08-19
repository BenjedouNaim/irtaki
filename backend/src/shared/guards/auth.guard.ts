import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Base AuthGuard stub (EPIC-00 / F-FND-03).
 *
 * Full JWT extraction, signature verification, and session lifecycle
 * enforcement will be implemented in EPIC-01 (F-AUTH-06).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(protected readonly reflector?: Reflector) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isPublic) {
        return true;
      }
    }

    // TODO (EPIC-01): validate JWT, set request.user
    throw new UnauthorizedException({
      statusCode: 401,
      error: 'TOKEN_EXPIRED',
      message: 'انتهت صلاحية الجلسة أو الرمز غير صالح',
    });
  }
}
