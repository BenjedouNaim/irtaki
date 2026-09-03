import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetCurrentWeeklyReportUseCase } from '../application/get-current-weekly-report/get-current-weekly-report.use-case';
import { WeeklyReportLiveResponseDto } from '../application/get-current-weekly-report/weekly-report-live-response.dto';

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
}
