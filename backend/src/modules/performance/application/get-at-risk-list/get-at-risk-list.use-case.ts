import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import { computeEffectiveWindow } from '../../../reports/domain/weekly-metrics-calculator';
import {
  AtRiskDetectionService,
  type AtRiskStudent,
} from '../../domain/at-risk-detection';
import {
  GROUP_PERFORMANCE_REPOSITORY,
  type GroupMemberRecord,
  type IGroupPerformanceRepository,
} from '../../domain/group-performance.repository.interface';
import { toAtRiskEntryDto } from '../at-risk.mapper';
import { GetAtRiskListResponseDto } from './at-risk-list-response.dto';

/**
 * F-PERF-04 / API-040 `GET /groups/{id}/at-risk` — the Teacher (assigned)
 * or Admin (all) reads the students of a group who meet the DEC-B05
 * at-risk predicate (UC-07 step 5, FR-PERF-08/10).
 *
 * Scope is settled upstream by `GroupPerformanceScopeGuard`, the same
 * route-specific guard API-038 uses for the same `/groups/{id}/…` path
 * (TS §15.2); the Assistant never arrives, being absent from `@Roles()`
 * (DEC-B09). Performance owns no table — the flag is a pure read-time
 * predicate, recomputed on every call and never persisted (DMS §22,
 * DBD §68, SAS §18.7 "depends on today's date").
 *
 * Three bounded, index-backed reads serve the whole response whatever the
 * group size: the group context, the Active member set (DB-IDX-03) and one
 * grouped `daily_reports` probe (DB-IDX-01) — never one query per member
 * (SA §20).
 *
 * **No `?period=` handling.** APIS §10.9 opens with "all four accept
 * `?period=`", but §18.4 defines the predicate itself without a period —
 * "the last 3 expected days … evaluated backwards from **today**" — and
 * API-040's payload carries no period-scoped figure to scope. The more
 * specific rule governs (AGENTS §2.4), so the parameter is neither read nor
 * rejected: APIS §9.3 already makes an unused query parameter "silently
 * ignored (not a 422) so old app versions calling with an extra param never
 * break".
 */
@Injectable()
export class GetAtRiskListUseCase {
  constructor(
    @Inject(GROUP_PERFORMANCE_REPOSITORY)
    private readonly repository: IGroupPerformanceRepository,
  ) {}

  async execute(
    callerId: string,
    groupId: string,
    now: Date = new Date(),
  ): Promise<GetAtRiskListResponseDto> {
    const context = await this.repository.findContext(groupId, callerId);
    if (!context) {
      // The Admin bypasses the ScopeGuard (DEC-C07), so an id naming no
      // group reaches the handler and is answered here (APIS §9.6). A
      // Teacher's out-of-scope or non-existent id was already masked as
      // 403 by the guard (NFR-20), so this branch is the Admin's alone.
      throw new NotFoundException({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'المورد المطلوب غير موجود',
      });
    }

    // FR-PERF-10 / DEC-C04: "terminated memberships are excluded ENTIRELY"
    // from the at-risk list (SAS §18.4's fourth bullet, AC-33). The
    // exclusion is a WHERE clause on the one member-set query — the Active
    // branch API-038's current-week view already uses (DB-IDX-03) — never a
    // filter applied to a fuller list afterwards (TS §15.2).
    const members = await this.repository.findActiveMembers(groupId);
    const lastReports = await this.readLastReportDates(members);

    const students: AtRiskStudent[] = [];
    for (const member of members) {
      const student = this.evaluate(member, lastReports, context, now);
      if (student) {
        students.push(student);
      }
    }

    return { data: students.map(toAtRiskEntryDto) };
  }

  /** ONE grouped `daily_reports` probe covering the whole member set. */
  private async readLastReportDates(
    members: readonly GroupMemberRecord[],
  ): Promise<Map<string, string>> {
    const rows = await this.repository.findLastReportDates(
      members.map((member) => member.membershipId),
    );
    return new Map(rows.map((row) => [row.membershipId, row.lastReportDate]));
  }

  /**
   * DS-04 for one member. `EffectiveWindow(m)` closes at `min(THEIR today,
   * ended_at, archived_at)` (SAS §18.1) — "today" being the student's own
   * `users.timezone` (T-01, INV-27), never the reading Teacher's, so the
   * same student's streak cannot change with who is looking. `ended_at` is
   * null throughout this list by construction: only Active memberships
   * reach here (FR-PERF-10).
   */
  private evaluate(
    member: GroupMemberRecord,
    lastReports: ReadonlyMap<string, string>,
    context: { archivedAt: string | null; recitationDay: number },
    now: Date,
  ): AtRiskStudent | null {
    const window = computeEffectiveWindow({
      startedAt: member.startedAt,
      today: localDateInTimezone(now, member.timezone),
      endedAt: member.endedAt,
      archivedAt: context.archivedAt
        ? localDateInTimezone(new Date(context.archivedAt), member.timezone)
        : null,
    });

    const evaluation = AtRiskDetectionService.evaluate({
      lastReportDate: lastReports.get(member.membershipId) ?? null,
      window,
      recitationDay: context.recitationDay,
    });

    if (!evaluation.atRisk) {
      return null;
    }

    return {
      membershipId: member.membershipId,
      fullName: member.fullName,
      daysSinceLastReport: evaluation.daysSinceLastReport,
    };
  }
}
