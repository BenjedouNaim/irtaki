import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { DashboardResponseDto } from '../application/get-dashboard/dashboard-response.dto';
import { GetDashboardUseCase } from '../application/get-dashboard/get-dashboard.use-case';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Dashboard route (TS §13 API implementation mapping —
 * `DashboardController.get`).
 */
@Controller()
export class DashboardController {
  constructor(private readonly getDashboardUseCase: GetDashboardUseCase) {}

  /**
   * API-009 `GET /me/dashboard` — "Any" authenticated role (APIS §8's
   * catalogue row and §6.1's matrix), so all five are listed. No `@Roles()`
   * exclusion applies here and none is implied: DEC-B09 keeps performance
   * data off the *Assistant's payload*, not the Assistant off this route
   * (UF §10: the exclusion is invisible, "not a visible tease").
   *
   * Scope is the caller's own session — a `/me` route has no path id to
   * guard, so there is no ScopeGuard (TS §15.2's "repository scope filter"
   * row). The role handed to the use case is the token's, never a client
   * assertion: APIS §10.3's discriminant is "the caller's own role", which
   * makes the response shape unforgeable rather than requested.
   */
  @Roles(
    UserRole.Admin,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Student,
    UserRole.User,
  )
  @Get('me/dashboard')
  async get(@Req() req: AuthenticatedRequest): Promise<DashboardResponseDto> {
    return this.getDashboardUseCase.execute(
      req.user.id,
      req.user.role as UserRole,
    );
  }
}
