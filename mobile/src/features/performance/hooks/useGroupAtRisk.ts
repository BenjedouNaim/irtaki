import { useQuery } from '@tanstack/react-query';
import {
  AtRiskEntryDto,
  getGroupAtRisk,
} from '@/shared/api/performance.client';

/**
 * Query key root for a group's at-risk list (API-040). Exported so a write
 * that changes a group's membership set can invalidate every group's list at
 * once (TS §26).
 */
export const GROUP_AT_RISK_QUERY_KEY = ['performance', 'at-risk'] as const;

/**
 * Group-scoped key with NO period segment — unlike
 * `groupPerformanceQueryKey`, because the at-risk predicate always looks
 * backwards from today (SAS §18.4) and the endpoint takes no period. One
 * group is one cache entry, shared by all four segments of SCR-23's
 * selector.
 */
export function groupAtRiskQueryKey(groupId: string) {
  return [...GROUP_AT_RISK_QUERY_KEY, groupId] as const;
}

/**
 * Feature hook for SCR-23's at-risk badges (F-PERF-04). Screens and
 * components consume this hook and never call the API client directly
 * (TS §10/§26/§37).
 *
 * The list is a SEPARATE predicate from the commitment score: UF §17 has the
 * badge "cross-referenced from the at-risk endpoint, never inferred from a
 * low score alone", which is why SCR-23 makes this second call rather than
 * deriving anything from API-038's `students`.
 */
export function useGroupAtRisk(groupId: string) {
  return useQuery<AtRiskEntryDto[], Error>({
    queryKey: groupAtRiskQueryKey(groupId),
    queryFn: () => getGroupAtRisk(groupId),
    enabled: groupId.length > 0,
  });
}
