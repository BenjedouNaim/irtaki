import { Module } from '@nestjs/common';
import { AUDIT_ENTRY_REPOSITORY } from './domain/audit-entry.repository.interface';
import { AuditEntryRepository } from './infrastructure/audit-entry.repository';
import { GetAuditLogUseCase } from './application/get-audit-log/get-audit-log.use-case';
import { AdminController } from './presentation/admin.controller';

/**
 * Administration (SA §11) — owns `audit_entries` and reads them back through
 * API-054. It calls into no other module: the audited write points live in
 * Identity and Groups (APIS §9.9), and the read resolves the actor
 * reference object in its own single query.
 */
@Module({
  controllers: [AdminController],
  providers: [
    {
      provide: AUDIT_ENTRY_REPOSITORY,
      useClass: AuditEntryRepository,
    },
    AuditEntryRepository,
    GetAuditLogUseCase,
  ],
  exports: [GetAuditLogUseCase],
})
export class AdministrationModule {}
