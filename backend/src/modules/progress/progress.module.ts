import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemorizationCoverageTypeOrmEntity } from './infrastructure/memorization-coverage.typeorm-entity';
import { CoverageIntervalTypeOrmEntity } from './infrastructure/coverage-interval.typeorm-entity';
import { HizbBoundaryTypeOrmEntity } from './infrastructure/hizb-boundary.typeorm-entity';
import { COVERAGE_REPOSITORY } from './domain/coverage.repository.interface';
import { CoverageRepository } from './infrastructure/coverage.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MemorizationCoverageTypeOrmEntity,
      CoverageIntervalTypeOrmEntity,
      HizbBoundaryTypeOrmEntity,
    ]),
  ],
  providers: [
    {
      provide: COVERAGE_REPOSITORY,
      useClass: CoverageRepository,
    },
    CoverageRepository,
  ],
  exports: [COVERAGE_REPOSITORY, CoverageRepository],
})
export class ProgressModule {}
