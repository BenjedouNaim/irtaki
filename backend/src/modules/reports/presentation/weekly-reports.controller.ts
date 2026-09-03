import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
import { OwnWeeklyReportScopeGuard } from './guards/own-weekly-report-scope.guard';

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
 * `DailyReportsController`, because the resource will also be served
 * nested under `/memberships/{id}` (API-036).
 */
@Controller()
export class WeeklyReportsController {
  constructor(
    private readonly getCurrentWeeklyReportUseCase: GetCurrentWeeklyReportUseCase,
    private readonly confirmWeeklyReportUseCase: ConfirmWeeklyReportUseCase,
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
}
