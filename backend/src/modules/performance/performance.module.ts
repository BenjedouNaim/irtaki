import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { GetOwnPerformanceUseCase } from './application/get-own-performance/get-own-performance.use-case';
import { PerformanceController } from './presentation/performance.controller';

/**
 * Performance module (SA §11, TS §11): owns NO table — every figure it
 * serves is a pure read-time derivation (DBD §68, DEC-A06/A10). It depends
 * on Reports, Memberships and Progress read-only; API-037 needs Reports
 * alone, whose repositories already resolve the caller's own membership
 * context in one indexed query (TS §15.2), so ReportsModule is the only
 * import until the remaining F-PERF slices need more.
 *
 * DS-03 `CommitmentScoreCalculator` lives in `domain/` as a pure,
 * framework-free calculator (TS §9, §24) and is invoked directly by the use
 * case — it holds no state and needs no provider.
 */
@Module({
  imports: [ReportsModule],
  controllers: [PerformanceController],
  providers: [GetOwnPerformanceUseCase],
})
export class PerformanceModule {}
