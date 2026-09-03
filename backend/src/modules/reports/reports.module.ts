import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReportTypeOrmEntity } from './infrastructure/daily-report.typeorm-entity';
import { DAILY_REPORT_REPOSITORY } from './domain/daily-report.repository.interface';
import { DailyReportRepository } from './infrastructure/daily-report.repository';
import { GetTodayReportStatusUseCase } from './application/get-today-report-status/get-today-report-status.use-case';
import { DailyReportsController } from './presentation/daily-reports.controller';

/**
 * Reports module (SA §11): owns `daily_reports` / `weekly_reports`, depends
 * on no other module — scope is resolved by joins inside its own repository.
 */
@Module({
  imports: [TypeOrmModule.forFeature([DailyReportTypeOrmEntity])],
  controllers: [DailyReportsController],
  providers: [
    {
      provide: DAILY_REPORT_REPOSITORY,
      useClass: DailyReportRepository,
    },
    DailyReportRepository,
    GetTodayReportStatusUseCase,
  ],
  exports: [DAILY_REPORT_REPOSITORY, DailyReportRepository],
})
export class ReportsModule {}
