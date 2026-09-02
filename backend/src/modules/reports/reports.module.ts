import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReportTypeOrmEntity } from './infrastructure/daily-report.typeorm-entity';
import { DAILY_REPORT_REPOSITORY } from './domain/daily-report.repository.interface';
import { DailyReportRepository } from './infrastructure/daily-report.repository';
import { ProgressModule } from '../progress/progress.module';
import { GetTodayReportStatusUseCase } from './application/get-today-report-status/get-today-report-status.use-case';
import { SubmitDailyReportUseCase } from './application/submit-daily-report/submit-daily-report.use-case';
import { ListOwnDailyReportsUseCase } from './application/list-own-daily-reports/list-own-daily-reports.use-case';
import { DailyReportsController } from './presentation/daily-reports.controller';

/**
 * Reports module (SA §11): owns `daily_reports` / `weekly_reports`. Scope is
 * resolved by joins inside its own repository. It imports ProgressModule for
 * the Quran reference data (VO-02 AyahRange construction) and to invoke
 * DS-05 synchronously through Progress's exported `UpdateCoverageUseCase`
 * (F-DR-02, APIS §10.7 post-submission `ahzab_completed`) — the structural
 * resolution adopted in EPIC-04 in place of an EventEmitter2 listener.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DailyReportTypeOrmEntity]),
    ProgressModule,
  ],
  controllers: [DailyReportsController],
  providers: [
    {
      provide: DAILY_REPORT_REPOSITORY,
      useClass: DailyReportRepository,
    },
    DailyReportRepository,
    GetTodayReportStatusUseCase,
    SubmitDailyReportUseCase,
    ListOwnDailyReportsUseCase,
  ],
  exports: [DAILY_REPORT_REPOSITORY, DailyReportRepository],
})
export class ReportsModule {}
