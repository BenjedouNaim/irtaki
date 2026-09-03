import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemorizationCoverageTypeOrmEntity } from './infrastructure/memorization-coverage.typeorm-entity';
import { CoverageIntervalTypeOrmEntity } from './infrastructure/coverage-interval.typeorm-entity';
import { HizbBoundaryTypeOrmEntity } from './infrastructure/hizb-boundary.typeorm-entity';
import { SurahTypeOrmEntity } from './infrastructure/surah.typeorm-entity';
import { COVERAGE_REPOSITORY } from './domain/coverage.repository.interface';
import { CoverageRepository } from './infrastructure/coverage.repository';
import { SURAH_REPOSITORY } from './domain/surah.repository.interface';
import { SurahRepository } from './infrastructure/surah.repository';
import { ListSurahsUseCase } from './application/list-surahs/list-surahs.use-case';
import { HIZB_BOUNDARY_REPOSITORY } from './domain/hizb-boundary.repository.interface';
import { HizbBoundaryRepository } from './infrastructure/hizb-boundary.repository';
import { GetHizbBoundariesUseCase } from './application/list-hizb-boundaries/get-hizb-boundaries.use-case';
import { UpdateCoverageUseCase } from './application/update-coverage/update-coverage.use-case';
import { GetOwnProgressUseCase } from './application/get-own-progress/get-own-progress.use-case';
import { GetMembershipProgressUseCase } from './application/get-membership-progress/get-membership-progress.use-case';
import { MembershipProgressScopeGuard } from './presentation/guards/membership-progress-scope.guard';
import { QuranController } from './presentation/quran.controller';
import { ProgressController } from './presentation/progress.controller';
import { CoverageReconciliationService } from './application/reconcile-coverage/coverage-reconciliation.service';
import { CoverageReconciliationJob } from './infrastructure/jobs/coverage-reconciliation.job';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemorizationCoverageTypeOrmEntity,
      CoverageIntervalTypeOrmEntity,
      HizbBoundaryTypeOrmEntity,
      SurahTypeOrmEntity,
    ]),
  ],
  controllers: [QuranController, ProgressController],
  providers: [
    {
      provide: COVERAGE_REPOSITORY,
      useClass: CoverageRepository,
    },
    CoverageRepository,
    {
      provide: SURAH_REPOSITORY,
      useClass: SurahRepository,
    },
    SurahRepository,
    ListSurahsUseCase,
    {
      provide: HIZB_BOUNDARY_REPOSITORY,
      useClass: HizbBoundaryRepository,
    },
    HizbBoundaryRepository,
    GetHizbBoundariesUseCase,
    // F-PRG-01: DS-05 coverage engine entry point (synchronously callable by SubmitDailyReportUseCase)
    UpdateCoverageUseCase,
    GetOwnProgressUseCase,
    GetMembershipProgressUseCase,
    MembershipProgressScopeGuard,
    // F-NOT-05 / ADR-029: the nightly coverage repair that ADR-026's
    // two-transaction submission path makes Required. Missed when F-PRG-01
    // was scoped; it belongs to this module, which owns the table it
    // corrects (SA §11).
    CoverageReconciliationService,
    CoverageReconciliationJob,
  ],
  exports: [
    COVERAGE_REPOSITORY,
    CoverageRepository,
    SURAH_REPOSITORY,
    SurahRepository,
    HIZB_BOUNDARY_REPOSITORY,
    HizbBoundaryRepository,
    UpdateCoverageUseCase,
  ],
})
export class ProgressModule {}
