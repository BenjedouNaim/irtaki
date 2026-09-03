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

/**
 * Reports module (SA §11): owns `daily_reports` / `weekly_reports`. Scope is
 * resolved by joins inside its own repository (list routes) and by its own
 * `MembershipReportScope` lookup inside a route-specific ScopeGuard
 * (`/memberships/{id}/…` routes, TS §15.2). It imports ProgressModule for
 * the Quran reference data (VO-02 AyahRange construction) and to invoke
 * DS-05 synchronously through Progress's exported `UpdateCoverageUseCase`
 * (F-DR-02, APIS §10.7 post-submission `ahzab_completed`) — the structural
 * resolution adopted in EPIC-04 in place of an EventEmitter2 listener.
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
    GetTodayReportStatusUseCase,
    SubmitDailyReportUseCase,
    ListOwnDailyReportsUseCase,
    ListRosterDailyReportsUseCase,
    GetCurrentWeeklyReportUseCase,
  ],
  exports: [
    DAILY_REPORT_REPOSITORY,
    DailyReportRepository,
    WEEKLY_REPORT_REPOSITORY,
    WeeklyReportRepository,
  ],
})
export class ReportsModule {}
