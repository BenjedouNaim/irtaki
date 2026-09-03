import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../shared';
import { UserRole } from '../../identity/domain/user-role.enum';
import { GetAuditLogUseCase } from '../application/get-audit-log/get-audit-log.use-case';
import { GetAuditLogQueryDto } from '../application/get-audit-log/get-audit-log-query.dto';
import { GetAuditLogResponseDto } from '../application/get-audit-log/audit-entry.dto';

/**
 * Administration module HTTP surface (TS §13: `AdminController.auditLog`).
 * `GET /audit` is Admin-only (APIS §8 role matrix, SA §17) — every other
 * role is simply absent from `@Roles()`, so RolesGuard yields `403`
 * unconditionally. There is no scope dimension: the log is centre-wide and
 * the single Admin account (INV-02) is its only reader.
 */
@Controller('audit')
export class AdminController {
  constructor(private readonly getAuditLogUseCase: GetAuditLogUseCase) {}

  @Roles(UserRole.Admin)
  @Get()
  async auditLog(
    @Query() query: GetAuditLogQueryDto,
  ): Promise<GetAuditLogResponseDto> {
    return this.getAuditLogUseCase.execute(query);
  }
}
