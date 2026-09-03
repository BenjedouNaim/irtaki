import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetCurrentWeeklyReportUseCase } from '../application/get-current-weekly-report/get-current-weekly-report.use-case';
import { WeeklyReportLiveResponseDto } from '../application/get-current-weekly-report/weekly-report-live-response.dto';
import { ConfirmWeeklyReportUseCase } from '../application/confirm-weekly-report/confirm-weekly-report.use-case';
import { ConfirmWeeklyReportDto } from '../application/confirm-weekly-report/confirm-weekly-report.dto';
import { ConfirmWeeklyReportResponseDto } from '../application/confirm-weekly-report/confirm-weekly-report-response.dto';
import { ListOwnWeeklyReportsUseCase } from '../application/list-own-weekly-reports/list-own-weekly-reports.use-case';
import { ListOwnWeeklyReportsQueryDto } from '../application/list-own-weekly-reports/list-own-weekly-reports-query.dto';
import { ListOwnWeeklyReportsResponseDto } from '../application/list-own-weekly-reports/list-own-weekly-reports-response.dto';
import { ListRosterWeeklyReportsUseCase } from '../application/list-roster-weekly-reports/list-roster-weekly-reports.use-case';
import { ListRosterWeeklyReportsQueryDto } from '../application/list-roster-weekly-reports/list-roster-weekly-reports-query.dto';
import { ListRosterWeeklyReportsResponseDto } from '../application/list-roster-weekly-reports/list-roster-weekly-reports-response.dto';
import { OwnWeeklyReportScopeGuard } from './guards/own-weekly-report-scope.guard';
import { MembershipWeeklyReportsScopeGuard } from './guards/membership-weekly-reports-scope.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Weekly Reports routes (TS §13 API implementation mapping —
 * `WeeklyReportsController`). Paths are spelled in full, as in
 * `DailyReportsController`, because the controller serves both the
 * `/weekly-reports` resource (API-033…035) and the staff view nested
 * under `/memberships/{id}` (API-036).
 */
@Controller()
export class WeeklyReportsController {
  constructor(
    private readonly getCurrentWeeklyReportUseCase: GetCurrentWeeklyReportUseCase,
    private readonly confirmWeeklyReportUseCase: ConfirmWeeklyReportUseCase,
    private readonly listOwnWeeklyReportsUseCase: ListOwnWeeklyReportsUseCase,
    private readonly listRosterWeeklyReportsUseCase: ListRosterWeeklyReportsUseCase,
  ) {}

  /**
   * API-033 `GET /weekly-reports/current` — Student only (APIS §6.1).
   * Assistant is deliberately absent from @Roles() (DEC-B09): RolesGuard
   * alone yields the uniform 403. Scope (own Active membership) is applied
   * inside the use case's single repository lookup — no path id to guard.
   */
  @Roles(UserRole.Student)
  @Get('weekly-reports/current')
  async current(
    @Req() req: AuthenticatedRequest,
  ): Promise<WeeklyReportLiveResponseDto> {
    return this.getCurrentWeeklyReportUseCase.execute(req.user.id);
  }

  /**
   * API-034 `POST /weekly-reports/{id}/confirm` — Student only, "Own,
   * recitation day" (APIS §6.1/§8; Assistant absent from @Roles(), DEC-B09).
   * `200` — an action POST that creates no resource (APIS §9.6) — with the
   * finalised report. Scope is resolved BEFORE this handler by
   * OwnWeeklyReportScopeGuard (SA §14 "Guard for single-resource routes",
   * TS §15.2); the use case re-applies it in its own lookup (NFR-19).
   * Errors: `422 NOT_RECITATION_DAY` (VR-21), `409 ALREADY_FINALISED`
   * (VR-36), `403 SCOPE_DENIED` uniform for anyone else's report (NFR-20).
   */
  @Roles(UserRole.Student)
  @UseGuards(OwnWeeklyReportScopeGuard)
  @Post('weekly-reports/:id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ConfirmWeeklyReportDto,
  ): Promise<ConfirmWeeklyReportResponseDto> {
    return this.confirmWeeklyReportUseCase.execute(req.user.id, id, dto);
  }

  /**
   * API-035 `GET /weekly-reports?from=&to=` — Student only (APIS §6.1;
   * Assistant absent from @Roles(), DEC-B09). Own history, `week_start
   * DESC`, cursor-paginated (APIS §9.2/§9.4) — "same pagination/scope
   * pattern as daily reports" (APIS §10.8). Scope is the caller's own
   * Active membership, applied inside the repository query — a list route
   * has no path id to guard (TS §15.2 "repository scope filter").
   */
  @Roles(UserRole.Student)
  @Get('weekly-reports')
  async mine(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListOwnWeeklyReportsQueryDto,
  ): Promise<ListOwnWeeklyReportsResponseDto> {
    return this.listOwnWeeklyReportsUseCase.execute(req.user.id, query);
  }

  /**
   * API-036 `GET /memberships/{id}/weekly-reports` — Teacher (assigned
   * group) and Admin (all); "same pagination/scope pattern as daily
   * reports" (APIS §10.8). Assistant is deliberately absent from @Roles()
   * (DEC-B09): RolesGuard alone yields the unconditional 403, whatever
   * group it is assigned to. Scope is resolved BEFORE this handler by
   * MembershipWeeklyReportsScopeGuard (TS §15.2 "one indexed lookup before
   * the handler runs"); the id handed to the use case is the one that
   * passed that guard.
   */
  @Roles(UserRole.Admin, UserRole.Teacher)
  @UseGuards(MembershipWeeklyReportsScopeGuard)
  @Get('memberships/:id/weekly-reports')
  async forMembership(
    @Param('id') id: string,
    @Query() query: ListRosterWeeklyReportsQueryDto,
  ): Promise<ListRosterWeeklyReportsResponseDto> {
    return this.listRosterWeeklyReportsUseCase.execute(id, query);
  }
}
