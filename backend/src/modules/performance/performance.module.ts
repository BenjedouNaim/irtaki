import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { GetAtRiskListUseCase } from './application/get-at-risk-list/get-at-risk-list.use-case';
import { GetGroupPerformanceUseCase } from './application/get-group-performance/get-group-performance.use-case';
import { GetMembershipPerformanceUseCase } from './application/get-membership-performance/get-membership-performance.use-case';
import { GetOwnPerformanceUseCase } from './application/get-own-performance/get-own-performance.use-case';
import { GROUP_PERFORMANCE_REPOSITORY } from './domain/group-performance.repository.interface';
import { GROUP_PERFORMANCE_SCOPE } from './domain/group-performance-scope.interface';
import { MEMBERSHIP_PERFORMANCE_REPOSITORY } from './domain/membership-performance.repository.interface';
import { MEMBERSHIP_PERFORMANCE_SCOPE } from './domain/membership-performance-scope.interface';
import { GroupPerformanceRepository } from './infrastructure/group-performance.repository';
import { GroupPerformanceScope } from './infrastructure/group-performance-scope';
import { MembershipPerformanceRepository } from './infrastructure/membership-performance.repository';
import { MembershipPerformanceScope } from './infrastructure/membership-performance-scope';
import { GroupPerformanceScopeGuard } from './presentation/guards/group-performance-scope.guard';
import { MembershipPerformanceScopeGuard } from './presentation/guards/membership-performance-scope.guard';
import { PerformanceController } from './presentation/performance.controller';

/**
 * Performance module (SA §11, TS §11): owns NO table — every figure it
 * serves is a pure read-time derivation (DBD §68, DEC-A06/A10). It depends
 * on Reports, Memberships and Progress read-only; API-037 needs Reports
 * alone, whose repositories already resolve the caller's own membership
 * context in one indexed query (TS §15.2), so ReportsModule is the only
 * module import.
 *
 * API-038 reads `memberships`, `daily_reports` and `weekly_reports` across
 * a whole group — the access APIS §12 attributes to the Performance module
 * for UC-07 — through its OWN infrastructure (`GroupPerformanceRepository`,
 * `GroupPerformanceScope`), so it never injects another module's repository
 * to resolve scope (SA §14 / TS §15.2). The same posture the Reports module
 * takes with `MembershipReportScope`.
 *
 * API-039 (UC-08) adds only what it cannot borrow: its own scope resolver
 * and its own one-row `memberships ⋈ groups ⋈ users` context read. The
 * per-membership report reads are Reports' own — the very queries API-037
 * already issues — so DS-03 runs over identical data whether the membership
 * is the caller's or a caller-supplied id.
 *
 * DS-03 `CommitmentScoreCalculator` lives in `domain/` as a pure,
 * framework-free calculator (TS §9, §24) and is invoked directly by the use
 * cases — it holds no state and needs no provider.
 */
@Module({
  imports: [ReportsModule],
  controllers: [PerformanceController],
  providers: [
    GetOwnPerformanceUseCase,
    // F-PERF-02: API-038's own reads and its route-specific ScopeGuard.
    {
      provide: GROUP_PERFORMANCE_REPOSITORY,
      useClass: GroupPerformanceRepository,
    },
    {
      provide: GROUP_PERFORMANCE_SCOPE,
      useClass: GroupPerformanceScope,
    },
    GroupPerformanceScopeGuard,
    GetGroupPerformanceUseCase,
    // F-PERF-03: API-039's context read and its route-specific ScopeGuard.
    {
      provide: MEMBERSHIP_PERFORMANCE_REPOSITORY,
      useClass: MembershipPerformanceRepository,
    },
    {
      provide: MEMBERSHIP_PERFORMANCE_SCOPE,
      useClass: MembershipPerformanceScope,
    },
    MembershipPerformanceScopeGuard,
    GetMembershipPerformanceUseCase,
    // F-PERF-04: API-040 reuses API-038's group reads and its ScopeGuard —
    // same path parameter, same role pair, same one indexed lookup — and
    // adds only DS-04's `MAX(report_date)` probe to the repository. DS-04
    // `AtRiskDetectionService` lives in `domain/` as a pure, framework-free
    // service (TS §9, §24), holds no state and needs no provider.
    GetAtRiskListUseCase,
  ],
})
export class PerformanceModule {}
