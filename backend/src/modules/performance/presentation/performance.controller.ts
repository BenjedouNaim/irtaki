import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetOwnPerformanceUseCase } from '../application/get-own-performance/get-own-performance.use-case';
import { GetOwnPerformanceQueryDto } from '../application/get-own-performance/get-own-performance-query.dto';
import { GetOwnPerformanceResponseDto } from '../application/get-own-performance/performance-response.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Performance routes (TS §13 API implementation mapping —
 * `PerformanceController`).
 */
@Controller()
export class PerformanceController {
  constructor(
    private readonly getOwnPerformanceUseCase: GetOwnPerformanceUseCase,
  ) {}

  /**
   * API-037 `GET /me/performance?period=` — Student only, own scope
   * (APIS §6.1). Assistant is deliberately absent from `@Roles()`
   * (DEC-B09): RolesGuard alone yields the unconditional 403 that APIS
   * §10.9 repeats for every performance endpoint. Teacher, Admin and User
   * are equally absent — the row grants this route to `✓ own` only.
   *
   * Scope (the caller's own Active membership) is applied inside the use
   * case's single context lookup — a `/me` route has no path id to guard
   * (TS §15.2 "repository scope filter").
   */
  @Roles(UserRole.Student)
  @Get('me/performance')
  async mine(
    @Req() req: AuthenticatedRequest,
    @Query() query: GetOwnPerformanceQueryDto,
  ): Promise<GetOwnPerformanceResponseDto> {
    return this.getOwnPerformanceUseCase.execute(req.user.id, query);
  }
}
