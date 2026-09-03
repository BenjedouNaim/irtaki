import { Module } from '@nestjs/common';
import { EnrollmentModule } from '../enrollment/enrollment.module';
import { GroupsModule } from '../groups/groups.module';
import { IdentityModule } from '../identity/identity.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { PerformanceModule } from '../performance/performance.module';
import { ReportsModule } from '../reports/reports.module';
import { GetDashboardUseCase } from './application/get-dashboard/get-dashboard.use-case';
import { DashboardController } from './presentation/dashboard.controller';

/**
 * Dashboard (F-DASH-01 / API-009) — the one place in the backend that is
 * **not** an SA §11 module: TS §12 calls `GetDashboardUseCase` a
 * "cross-module orchestrator, **no owning module**", and APIS §10.3 calls
 * the endpoint "an API-layer aggregation only, not a new domain concept".
 *
 * So this module owns no table, no entity, no value object and no domain
 * service, and has no `domain/` or `infrastructure/` folder to put one in.
 * It is a presentation + application shell over the owning modules' already-
 * public surface: their exported use cases first, and their exported
 * repository tokens only for the four Admin counts, which no use case
 * produces. That is the same surface `PerformanceModule` already consumes
 * from `ReportsModule` (`DAILY_REPORT_REPOSITORY`), not a private reach-in.
 *
 * SA §11's graph is unchanged by this: no module gains a dependency, no
 * cycle is introduced (nothing imports `DashboardModule`), and every read
 * still runs inside the module that owns the table — including scope
 * resolution, which `ListGroupsUseCase` and the two Performance use cases
 * each perform for themselves (TS §15.2).
 *
 * `PerformanceModule` is imported for the Student's and Teacher's figures
 * only. It is deliberately unreachable from the Assistant branch of
 * `GetDashboardUseCase` (DEC-B09), which the Assistant response type also
 * forbids structurally.
 */
@Module({
  imports: [
    EnrollmentModule,
    GroupsModule,
    IdentityModule,
    MembershipsModule,
    PaymentsModule,
    PerformanceModule,
    ReportsModule,
  ],
  controllers: [DashboardController],
  providers: [GetDashboardUseCase],
})
export class DashboardModule {}
