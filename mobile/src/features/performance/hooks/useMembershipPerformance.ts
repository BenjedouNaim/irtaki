import { useQuery } from '@tanstack/react-query';
import {
  getMembershipPerformance,
  PerformanceDto,
  PerformancePeriod,
} from '@/shared/api/performance.client';

/**
 * Query key root for one student's performance dashboard (API-039).
 * Exported so a write that changes a student's reports can invalidate every
 * period of every membership at once (TS §26).
 */
export const MEMBERSHIP_PERFORMANCE_QUERY_KEY = [
  'performance',
  'membership',
] as const;

/**
 * Membership- and period-scoped key. The period is part of the key because
 * every figure is recomputed per period server-side (FR-PERF-07) — two
 * periods are two different resources, never one cache entry.
 */
export function membershipPerformanceQueryKey(
  membershipId: string,
  period: PerformancePeriod = 'week',
) {
  return [...MEMBERSHIP_PERFORMANCE_QUERY_KEY, membershipId, period] as const;
}

/**
 * Feature hook for SCR-24's performance content (F-PERF-03). Screens and
 * components consume this hook and never call the API client directly
 * (TS §10/§26/§37).
 *
 * `custom` is not requested here: SCR-24 shows the fourth segment but the
 * Figma file has no date-range picker on this screen, so it is never
 * selected — the same posture SCR-13 and SCR-23 take.
 */
export function useMembershipPerformance(
  membershipId: string,
  period: PerformancePeriod = 'week',
  options: { enabled?: boolean } = {},
) {
  return useQuery<PerformanceDto, Error>({
    queryKey: membershipPerformanceQueryKey(membershipId, period),
    queryFn: () => getMembershipPerformance(membershipId, { period }),
    enabled: (options.enabled ?? true) && membershipId.length > 0,
  });
}
