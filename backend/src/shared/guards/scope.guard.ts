import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

/**
 * ScopeGuard skeleton (F-AUTH-06, SA §14/§15, NFR-19/NFR-20).
 *
 * Instance-level ownership / scope verification is specialized per module
 * in subsequent Epics (EPIC-02+). Safe pass-through by default.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(protected readonly reflector?: Reflector) {}

  canActivate(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return true;
  }
}
