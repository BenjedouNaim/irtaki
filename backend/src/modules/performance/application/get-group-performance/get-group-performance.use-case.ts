import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { localDateInTimezone } from '../../../reports/domain/local-date';
import {
  reportingWeekContaining,
  reportingWeeksIntersecting,
} from '../../../reports/domain/reporting-week';
import {
  computeEffectiveWindow,
  computeWeeklyMetrics,
  type DatedDailyReportSnapshot,
  type EffectiveWindow,
  type WeeklyMetrics,
} from '../../../reports/domain/weekly-metrics-calculator';
import { CommitmentScoreCalculator } from '../../domain/commitment-score';
import { selectGroupMemberSet } from '../../domain/group-member-set';
import {
  aggregateGroupPerformance,
  type GroupMemberPerformance,
} from '../../domain/group-performance';
import {
  GROUP_PERFORMANCE_REPOSITORY,
  type GroupMemberRecord,
  type IGroupPerformanceRepository,
} from '../../domain/group-performance.repository.interface';
import {
  resolvePerformancePeriod,
  type PerformancePeriod,
} from '../../domain/performance-period';
import { toGroupPerformanceDto } from '../group-performance.mapper';
import { GetGroupPerformanceQueryDto } from './get-group-performance-query.dto';
import { GetGroupPerformanceResponseDto } from './group-performance-response.dto';

/** One member's resolved period, window and reporting weeks. */
interface MemberSpan {
  member: GroupMemberRecord;
  window: EffectiveWindow;
  weeks: ReturnType<typeof reportingWeeksIntersecting>;
  /** The weeks whose recitation day has already passed — `W(P)` (DEC-A10). */
  elapsedWeekStarts: Set<string>;
}

/**
 * F-PERF-02 / API-038 `GET /groups/{id}/performance?period=` — the Teacher
 * (assigned) or Admin (all) reads a group-wide performance summary,
 * weakest-first (UC-07, FR-PERF-01/03/06).
 *
 * Scope is settled upstream by `GroupPerformanceScopeGuard` (TS §15.2);
 * the Assistant never arrives, being absent from `@Roles()` (DEC-B09).
 * Performance owns no table — every figure here is a pure read-time
 * derivation over Reports/Memberships reads (SA §11, APIS §12 UC-07,
 * DBD §68), recomputed on every call and never persisted (TS §24).
 *
 * Four bounded, index-backed reads serve the whole response, whatever the
 * group size: the context, the member set, one `daily_reports` range walk
 * and one `weekly_reports` range scan (SA §20 — never one query per
 * member).
 */
@Injectable()
export class GetGroupPerformanceUseCase {
  constructor(
    @Inject(GROUP_PERFORMANCE_REPOSITORY)
    private readonly repository: IGroupPerformanceRepository,
  ) {}

  async execute(
    callerId: string,
    groupId: string,
    query: GetGroupPerformanceQueryDto,
    now: Date = new Date(),
  ): Promise<GetGroupPerformanceResponseDto> {
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

    // The group dashboard is a group-level view over DATES (SAS §19: "group
    // aggregates are computed over dates, not instants, so per-student
    // timezones never desynchronise a date-keyed aggregate"), so the
    // `?period=` window is measured once, from the caller's own
    // `users.timezone` — T-01/INV-27 applied to the only User the period
    // SELECTION involves. Each member's own EffectiveWindow still closes on
    // THEIR today, in THEIR timezone (T-01 applied to them), below.
    const callerToday = localDateInTimezone(now, context.callerTimezone);
    const period = resolvePerformancePeriod({
      period: query.period,
      from: query.from,
      to: query.to,
      today: callerToday,
      recitationDay: context.recitationDay,
    });

    const members = await this.resolveMemberSet(groupId, period, {
      recitationDay: context.recitationDay,
      today: callerToday,
    });

    const spans = members.map((member) =>
      this.spanOf(member, period, context, now),
    );
    const membershipIds = spans.map((span) => span.member.membershipId);

    const snapshots = await this.readSnapshots(spans, membershipIds);
    const attendedWeeks = await this.readAttendedWeeks(spans, membershipIds);

    const performances = spans.map((span) =>
      this.performanceOf(span, snapshots, attendedWeeks),
    );

    return {
      data: toGroupPerformanceDto(aggregateGroupPerformance(performances)),
    };
  }

  /**
   * UC-07 steps 3 and 6 — the member set, resolved by ONE indexed query in
   * the branch the rule selects, never by fetching everyone and filtering
   * afterwards (TS §15.2):
   *
   * - `period` resolves to the current reporting week → FR-PERF-10: the
   *   Active memberships only, whatever their window (DB-IDX-03);
   * - any other period → FR-PERF-09: every membership, Terminated
   *   included, whose active window intersects `P` (DB-IDX-04).
   *
   * "Resolves to" is read literally: the branch is decided by the RESOLVED
   * range, so `?period=week`, an omitted `period` and a `custom` range that
   * happens to be exactly this reporting week all take the FR-PERF-10 path.
   * The domain predicate is re-applied to the rows either way, so the two
   * halves of the rule are also unit-testable without a database.
   */
  private async resolveMemberSet(
    groupId: string,
    period: PerformancePeriod,
    anchor: { recitationDay: number; today: string },
  ): Promise<GroupMemberRecord[]> {
    const currentWeek = reportingWeekContaining(
      anchor.today,
      anchor.recitationDay,
    );
    const isCurrentWeek =
      period.from === currentWeek.weekStart &&
      period.to === currentWeek.weekEnd;

    const rows = isCurrentWeek
      ? await this.repository.findActiveMembers(groupId)
      : await this.repository.findMembersIntersecting(
          groupId,
          period.from,
          period.to,
        );

    return selectGroupMemberSet({ members: rows, period, isCurrentWeek });
  }

  /**
   * `P ∩ EffectiveWindow(m)` for one member and the reporting weeks it
   * spans (SAS §18.1/§18.3, FR-PERF-07) — the same computation API-037
   * performs for a Student's own dashboard, so a member's
   * `commitment_score` here is the number their own Progress tab shows.
   *
   * `EffectiveWindow(m)` closes at `min(their today, ended_at,
   * archived_at)`, which is what "for the portion of the period during
   * which their Membership was active" means for a Terminated member
   * (FR-PERF-09, FR-WR-10): nothing after `ended_at` is ever counted.
   */
  private spanOf(
    member: GroupMemberRecord,
    period: PerformancePeriod,
    context: { archivedAt: string | null; recitationDay: number },
    now: Date,
  ): MemberSpan {
    const memberToday = localDateInTimezone(now, member.timezone);
    const window = computeEffectiveWindow({
      startedAt: member.startedAt,
      today: memberToday,
      endedAt: member.endedAt,
      archivedAt: context.archivedAt
        ? localDateInTimezone(new Date(context.archivedAt), member.timezone)
        : null,
    });

    const weeks = reportingWeeksIntersecting(
      maxDate(period.from, window.from),
      minDate(period.to, window.to),
      context.recitationDay,
    );

    // `weeks elapsed` — AttendanceRate's denominator (SRS §9.4.3, DEC-A10):
    // only weeks whose recitation day has already passed. A running week has
    // fed nothing into attendance yet (DEC-A03) and counting it would score
    // it 0 for data that does not exist (EC-44, AC-26, DEC-B04).
    return {
      member,
      window,
      weeks,
      elapsedWeekStarts: new Set(
        weeks
          .filter((week) => week.weekEnd < window.to)
          .map((w) => w.weekStart),
      ),
    };
  }

  /**
   * ONE `daily_reports` range walk covering every member's span, grouped by
   * membership afterwards — never one query per member (SA §20). The bounds
   * are the union of the member spans, so no member's own window is widened.
   */
  private async readSnapshots(
    spans: readonly MemberSpan[],
    membershipIds: readonly string[],
  ): Promise<Map<string, DatedDailyReportSnapshot[]>> {
    const byMembership = new Map<string, DatedDailyReportSnapshot[]>();
    const bounds = spanBounds(spans, (span) =>
      span.weeks.length === 0
        ? null
        : {
            from: span.weeks[0].weekStart,
            to: span.weeks[span.weeks.length - 1].weekEnd,
          },
    );
    if (!bounds) {
      return byMembership;
    }

    const rows = await this.repository.findDaySnapshots(
      membershipIds,
      bounds.from,
      bounds.to,
    );
    for (const row of rows) {
      const bucket = byMembership.get(row.membershipId) ?? [];
      bucket.push(row);
      byMembership.set(row.membershipId, bucket);
    }
    return byMembership;
  }

  /** ONE `weekly_reports` range scan over the union of the members' `W(P)`. */
  private async readAttendedWeeks(
    spans: readonly MemberSpan[],
    membershipIds: readonly string[],
  ): Promise<Map<string, Set<string>>> {
    const byMembership = new Map<string, Set<string>>();
    const bounds = spanBounds(spans, (span) => {
      const starts = [...span.elapsedWeekStarts].sort();
      return starts.length === 0
        ? null
        : { from: starts[0], to: starts[starts.length - 1] };
    });
    if (!bounds) {
      return byMembership;
    }

    const rows = await this.repository.findAttendedWeeks(
      membershipIds,
      bounds.from,
      bounds.to,
    );
    for (const row of rows) {
      const bucket = byMembership.get(row.membershipId) ?? new Set<string>();
      bucket.add(row.weekStart);
      byMembership.set(row.membershipId, bucket);
    }
    return byMembership;
  }

  /**
   * DS-03 for one member (SAS §18.3) plus the two `SubmissionRate` operands
   * and the absence tally the group pools. `WeeklyMetricsCalculator` stays
   * the single implementation of every classification and denominator
   * (TS §22) — nothing is re-derived here.
   */
  private performanceOf(
    span: MemberSpan,
    snapshots: ReadonlyMap<string, DatedDailyReportSnapshot[]>,
    attendedWeeks: ReadonlyMap<string, Set<string>>,
  ): GroupMemberPerformance {
    const reports = snapshots.get(span.member.membershipId) ?? [];
    const metrics: WeeklyMetrics[] = span.weeks.map((week) =>
      computeWeeklyMetrics({
        week,
        effectiveWindow: span.window,
        reports,
      }),
    );

    const attended = attendedWeeks.get(span.member.membershipId);
    const attendedCount = attended
      ? [...span.elapsedWeekStarts].filter((start) => attended.has(start))
          .length
      : 0;

    const effectiveDays = metrics.reduce((sum, m) => sum + m.effectiveDays, 0);
    const missedReports = metrics.reduce(
      (sum, m) => sum + m.missedDailyReports,
      0,
    );

    return {
      membershipId: span.member.membershipId,
      fullName: span.member.fullName,
      commitmentScore: CommitmentScoreCalculator.calculate({
        weeks: metrics,
        weekCount: span.elapsedWeekStarts.size,
        attendedWeeks: attendedCount,
      }).value,
      effectiveDays,
      reportedDays: effectiveDays - missedReports,
      absenceBreakdown: CommitmentScoreCalculator.absenceBreakdown(metrics),
    };
  }
}

/** The union of the per-member ranges a bulk read has to cover, or null. */
function spanBounds(
  spans: readonly MemberSpan[],
  rangeOf: (span: MemberSpan) => { from: string; to: string } | null,
): { from: string; to: string } | null {
  let bounds: { from: string; to: string } | null = null;
  for (const span of spans) {
    const range = rangeOf(span);
    if (!range) {
      continue;
    }
    bounds = bounds
      ? {
          from: minDate(bounds.from, range.from),
          to: maxDate(bounds.to, range.to),
        }
      : range;
  }
  return bounds;
}

/** ISO `YYYY-MM-DD` strings order lexicographically, so `<` is date order. */
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
