import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Base ScopeGuard stub (EPIC-00 / F-FND-03).
 *
 * Instance-level ownership / scope verification (SA §14, NFR-19/NFR-20)
 * is specialized per module/resource in subsequent Epics.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  canActivate(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // TODO (EPIC-01 / per-module): instance-level scope check
    return true;
  }
}
