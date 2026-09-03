import { useQuery } from '@tanstack/react-query';
import {
  getGroupPerformance,
  GroupPerformanceDto,
  PerformancePeriod,
} from '@/shared/api/performance.client';

/**
 * Query key root for a group's performance dashboard (API-038). Exported so
 * a write that changes a group's membership set can invalidate every period
 * of every group at once (TS §26).
 */
export const GROUP_PERFORMANCE_QUERY_KEY = ['performance', 'group'] as const;

/**
 * Group- and period-scoped key. The period is part of the key because every
 * figure is recomputed per period server-side (FR-PERF-07) AND the member
 * set itself differs between the current week and any other period
 * (FR-PERF-09/10) — two periods are two different resources, never one
 * cache entry.
 */
export function groupPerformanceQueryKey(
  groupId: string,
  period: PerformancePeriod = 'week',
) {
  return [...GROUP_PERFORMANCE_QUERY_KEY, groupId, period] as const;
}

/**
 * Feature hook for SCR-23's performance content (F-PERF-02). Screens and
 * components consume this hook and never call the API client directly
 * (TS §10/§26/§37).
 *
 * `custom` is not requested here: SCR-23 shows the fourth segment but the
 * Figma file has no date-range picker on this screen, so it is never
 * selected.
 */
export function useGroupPerformance(
  groupId: string,
  period: PerformancePeriod = 'week',
) {
  return useQuery<GroupPerformanceDto, Error>({
    queryKey: groupPerformanceQueryKey(groupId, period),
    queryFn: () => getGroupPerformance(groupId, { period }),
    enabled: groupId.length > 0,
  });
}
