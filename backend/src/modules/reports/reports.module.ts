import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReportTypeOrmEntity } from './infrastructure/daily-report.typeorm-entity';
import { DAILY_REPORT_REPOSITORY } from './domain/daily-report.repository.interface';
import { DailyReportRepository } from './infrastructure/daily-report.repository';
import { ProgressModule } from '../progress/progress.module';
import { GetTodayReportStatusUseCase } from './application/get-today-report-status/get-today-report-status.use-case';
import { SubmitDailyReportUseCase } from './application/submit-daily-report/submit-daily-report.use-case';
import { ListOwnDailyReportsUseCase } from './application/list-own-daily-reports/list-own-daily-reports.use-case';
import { ListRosterDailyReportsUseCase } from './application/list-roster-daily-reports/list-roster-daily-reports.use-case';
import { MEMBERSHIP_REPORT_SCOPE } from './domain/membership-report-scope.interface';
import { MembershipReportScope } from './infrastructure/membership-report-scope';
import { MembershipDailyReportsScopeGuard } from './presentation/guards/membership-daily-reports-scope.guard';
import { DailyReportsController } from './presentation/daily-reports.controller';
import { WeeklyReportTypeOrmEntity } from './infrastructure/weekly-report.typeorm-entity';
import { WEEKLY_REPORT_REPOSITORY } from './domain/weekly-report.repository.interface';
import { WeeklyReportRepository } from './infrastructure/weekly-report.repository';
import { GetCurrentWeeklyReportUseCase } from './application/get-current-weekly-report/get-current-weekly-report.use-case';
import { WeeklyReportsController } from './presentation/weekly-reports.controller';
import { ConfirmWeeklyReportUseCase } from './application/confirm-weekly-report/confirm-weekly-report.use-case';
import { WeeklyReportFinalizationService } from './application/finalise-weekly-reports/weekly-report-finalization.service';
import { WeeklyReportFinalizationJob } from './infrastructure/jobs/weekly-report-finalization.job';
import { WEEKLY_REPORT_SCOPE } from './domain/weekly-report-scope.interface';
import { WeeklyReportScope } from './infrastructure/weekly-report-scope';
import { OwnWeeklyReportScopeGuard } from './presentation/guards/own-weekly-report-scope.guard';
import { ListOwnWeeklyReportsUseCase } from './application/list-own-weekly-reports/list-own-weekly-reports.use-case';
import { ListRosterWeeklyReportsUseCase } from './application/list-roster-weekly-reports/list-roster-weekly-reports.use-case';
import { MembershipWeeklyReportsScopeGuard } from './presentation/guards/membership-weekly-reports-scope.guard';

/**
 * Reports module (SA §11): owns `daily_reports` / `weekly_reports`. Scope is
 * resolved by joins inside its own repository (list routes) and by its own
 * `MembershipReportScope` lookup inside a route-specific ScopeGuard
 * (`/memberships/{id}/…` routes, TS §15.2). It imports ProgressModule for
 * the Quran reference data (VO-02 AyahRange construction) and to invoke
 * DS-05 synchronously through Progress's exported `UpdateCoverageUseCase`
 * (F-DR-02, APIS §10.7 post-submission `ahzab_completed`) — the structural
 * resolution adopted in EPIC-04 in place of an EventEmitter2 listener.
 * It also hosts DS-02 and `WeeklyReportFinalizationJob`, the module's
 * ADR-024 scheduled job (F-WR-02); `ScheduleModule` is registered once in
 * AppModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyReportTypeOrmEntity,
      WeeklyReportTypeOrmEntity,
    ]),
    ProgressModule,
  ],
  controllers: [DailyReportsController, WeeklyReportsController],
  providers: [
    {
      provide: DAILY_REPORT_REPOSITORY,
      useClass: DailyReportRepository,
    },
    DailyReportRepository,
    // F-WR-01: E-06 rows and the own-scope context of API-033.
    {
      provide: WEEKLY_REPORT_REPOSITORY,
      useClass: WeeklyReportRepository,
    },
    WeeklyReportRepository,
    // F-DR-06: staff-scope resolution for /memberships/{id}/daily-reports,
    // owned by Reports (SA §11) and consumed by its route-specific ScopeGuard.
    {
      provide: MEMBERSHIP_REPORT_SCOPE,
      useClass: MembershipReportScope,
    },
    MembershipDailyReportsScopeGuard,
    // F-WR-04: the same staff-scope resolution for /memberships/{id}/weekly-reports.
    MembershipWeeklyReportsScopeGuard,
    // F-WR-02: own-scope resolution for POST /weekly-reports/{id}/confirm
    // (API-034), consumed by its route-specific ScopeGuard (SA §14).
    {
      provide: WEEKLY_REPORT_SCOPE,
      useClass: WeeklyReportScope,
    },
    OwnWeeklyReportScopeGuard,
    GetTodayReportStatusUseCase,
    SubmitDailyReportUseCase,
    ListOwnDailyReportsUseCase,
    ListRosterDailyReportsUseCase,
    GetCurrentWeeklyReportUseCase,
    ConfirmWeeklyReportUseCase,
    // F-WR-03: own weekly history (API-035), scope inside the repository.
    ListOwnWeeklyReportsUseCase,
    // F-WR-04: staff weekly history (API-036), scope resolved by its guard.
    ListRosterWeeklyReportsUseCase,
    // F-WR-02: DS-02 and its ADR-024 cron trigger (SA §19 background jobs).
    WeeklyReportFinalizationService,
    WeeklyReportFinalizationJob,
  ],
  exports: [
    // API-029's read is also API-009's Student CTA state and its membership
    // probe (TS §12's cross-module orchestrator).
    GetTodayReportStatusUseCase,
    DAILY_REPORT_REPOSITORY,
    DailyReportRepository,
    WEEKLY_REPORT_REPOSITORY,
    WeeklyReportRepository,
    WeeklyReportFinalizationService,
  ],
})
export class ReportsModule {}
