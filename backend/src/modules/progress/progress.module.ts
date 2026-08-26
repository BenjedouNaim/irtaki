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
import { QuranController } from './presentation/quran.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemorizationCoverageTypeOrmEntity,
      CoverageIntervalTypeOrmEntity,
      HizbBoundaryTypeOrmEntity,
      SurahTypeOrmEntity,
    ]),
  ],
  controllers: [QuranController],
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
  ],
  exports: [
    COVERAGE_REPOSITORY,
    CoverageRepository,
    SURAH_REPOSITORY,
    SurahRepository,
  ],
})
export class ProgressModule {}
