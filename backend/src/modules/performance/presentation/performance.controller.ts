import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetGroupPerformanceUseCase } from '../application/get-group-performance/get-group-performance.use-case';
import { GetGroupPerformanceQueryDto } from '../application/get-group-performance/get-group-performance-query.dto';
import { GetGroupPerformanceResponseDto } from '../application/get-group-performance/group-performance-response.dto';
import { GetOwnPerformanceUseCase } from '../application/get-own-performance/get-own-performance.use-case';
import { GetOwnPerformanceQueryDto } from '../application/get-own-performance/get-own-performance-query.dto';
import { GetOwnPerformanceResponseDto } from '../application/get-own-performance/performance-response.dto';
import { GroupPerformanceScopeGuard } from './guards/group-performance-scope.guard';

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
    private readonly getGroupPerformanceUseCase: GetGroupPerformanceUseCase,
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

  /**
   * API-038 `GET /groups/{id}/performance?period=` — Teacher (assigned
   * group) and Admin (all), per APIS §6.1's `✓ all` / `✓ (g)` row.
   *
   * The Assistant is deliberately absent from `@Roles()` (DEC-B09): the
   * RolesGuard alone yields the unconditional 403 APIS §10.9 repeats for
   * every performance endpoint — "regardless of group assignment". Student
   * and User are equally absent; the row grants this route to staff only.
   *
   * `GroupPerformanceScopeGuard` resolves the assigned-group scope with one
   * indexed lookup BEFORE the handler runs (TS §15.2, SA §14).
   */
  @Roles(UserRole.Admin, UserRole.Teacher)
  @UseGuards(GroupPerformanceScopeGuard)
  @Get('groups/:id/performance')
  async forGroup(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: GetGroupPerformanceQueryDto,
  ): Promise<GetGroupPerformanceResponseDto> {
    return this.getGroupPerformanceUseCase.execute(req.user.id, id, query);
  }
}
