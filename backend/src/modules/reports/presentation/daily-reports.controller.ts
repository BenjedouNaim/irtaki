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
import { GetTodayReportStatusUseCase } from '../application/get-today-report-status/get-today-report-status.use-case';
import { TodayReportStatusResponseDto } from '../application/get-today-report-status/today-report-status-response.dto';
import { SubmitDailyReportUseCase } from '../application/submit-daily-report/submit-daily-report.use-case';
import { SubmitDailyReportDto } from '../application/submit-daily-report/submit-daily-report.dto';
import { SubmitDailyReportResponseDto } from '../application/submit-daily-report/submit-daily-report-response.dto';
import { ListOwnDailyReportsUseCase } from '../application/list-own-daily-reports/list-own-daily-reports.use-case';
import { ListOwnDailyReportsQueryDto } from '../application/list-own-daily-reports/list-own-daily-reports-query.dto';
import { ListOwnDailyReportsResponseDto } from '../application/list-own-daily-reports/list-own-daily-reports-response.dto';
import { ListRosterDailyReportsUseCase } from '../application/list-roster-daily-reports/list-roster-daily-reports.use-case';
import { ListRosterDailyReportsQueryDto } from '../application/list-roster-daily-reports/list-roster-daily-reports-query.dto';
import { ListRosterDailyReportsResponseDto } from '../application/list-roster-daily-reports/list-roster-daily-reports-response.dto';
import { MembershipDailyReportsScopeGuard } from './guards/membership-daily-reports-scope.guard';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Daily Reports routes (TS §13 API implementation mapping —
 * `DailyReportsController`). Paths are spelled in full because the
 * controller serves both the `/daily-reports` resource (API-029…031) and
 * the staff view nested under `/memberships/{id}` (API-032).
 */
@Controller()
export class DailyReportsController {
  constructor(
    private readonly getTodayReportStatusUseCase: GetTodayReportStatusUseCase,
    private readonly submitDailyReportUseCase: SubmitDailyReportUseCase,
    private readonly listOwnDailyReportsUseCase: ListOwnDailyReportsUseCase,
    private readonly listRosterDailyReportsUseCase: ListRosterDailyReportsUseCase,
  ) {}

  /**
   * API-029 `GET /daily-reports/today` — Student only (APIS §6.1). Assistant
   * is deliberately absent from @Roles() (DEC-B09): RolesGuard alone yields
   * the uniform 403. Scope (own Active membership) is applied inside the
   * use case's single repository lookup — there is no path id to guard.
   */
  @Roles(UserRole.Student)
  @Get('daily-reports/today')
  async today(
    @Req() req: AuthenticatedRequest,
  ): Promise<TodayReportStatusResponseDto> {
    return this.getTodayReportStatusUseCase.execute(req.user.id);
  }

  /**
   * API-030 `POST /daily-reports` — Student only (APIS §6.1, TS §15.1;
   * Assistant absent from @Roles(), DEC-B09). `201` with
   * `{ id, report_date, type, ahzab_completed, coverage_updated }`. Scope is
   * the caller's own Active membership, resolved inside the use case.
   */
  @Roles(UserRole.Student)
  @Post('daily-reports')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitDailyReportDto,
  ): Promise<SubmitDailyReportResponseDto> {
    return this.submitDailyReportUseCase.execute(req.user.id, dto);
  }

  /**
   * API-031 `GET /daily-reports?from=&to=` — Student only (APIS §6.1;
   * Assistant absent from @Roles(), DEC-B09). Own history, `report_date
   * DESC`, cursor-paginated (APIS §9.2/§9.4). Scope is the caller's own
   * Active membership, applied inside the repository query — a list route
   * has no path id to guard (TS §15.2 "repository scope filter").
   */
  @Roles(UserRole.Student)
  @Get('daily-reports')
  async mine(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListOwnDailyReportsQueryDto,
  ): Promise<ListOwnDailyReportsResponseDto> {
    return this.listOwnDailyReportsUseCase.execute(req.user.id, query);
  }

  /**
   * API-032 `GET /memberships/{id}/daily-reports?from=&to=` — Teacher
   * (assigned group) and Admin (all); "same shape" as API-031 (APIS §10.7).
   * Assistant is deliberately absent from @Roles() (DEC-B09): RolesGuard
   * alone yields the unconditional 403, whatever group it is assigned to.
   * Scope is resolved BEFORE this handler by MembershipDailyReportsScopeGuard
   * (TS §15.2 "one indexed lookup before the handler runs"); the id handed
   * to the use case is the one that passed that guard.
   */
  @Roles(UserRole.Admin, UserRole.Teacher)
  @UseGuards(MembershipDailyReportsScopeGuard)
  @Get('memberships/:id/daily-reports')
  async forMembership(
    @Param('id') id: string,
    @Query() query: ListRosterDailyReportsQueryDto,
  ): Promise<ListRosterDailyReportsResponseDto> {
    return this.listRosterDailyReportsUseCase.execute(id, query);
  }
}
