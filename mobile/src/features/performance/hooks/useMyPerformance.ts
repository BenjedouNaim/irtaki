import { useQuery } from '@tanstack/react-query';
import {
  getMyPerformance,
  PerformanceDto,
  PerformancePeriod,
} from '@/shared/api/performance.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key root for the caller's own performance (API-037). Exported so
 * report-submission mutations can invalidate every period at once
 * (TS §26 — UF §15: a submitted report changes the Progress tab).
 */
export const MY_PERFORMANCE_QUERY_KEY = ['performance', 'mine'] as const;

/**
 * Account- and period-scoped key. The period is part of the key because
 * every metric is recomputed per period server-side (FR-PERF-07), so two
 * periods are two different resources, never one cache entry.
 */
export function myPerformanceQueryKey(
  userId?: string | null,
  period: PerformancePeriod = 'week',
) {
  return [...MY_PERFORMANCE_QUERY_KEY, userId ?? 'anonymous', period] as const;
}

/**
 * Feature hook for the Student's own commitment score and breakdown
 * (F-PERF-01, SCR-13 Performance section). Screens consume this hook and
 * never call the API client directly (TS §10/§26/§37).
 *
 * `custom` is not requested here: SCR-13 offers no date-range picker in the
 * Figma file, so the screen never selects it (see the section component).
 */
export function useMyPerformance(period: PerformancePeriod = 'week') {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<PerformanceDto, Error>({
    queryKey: myPerformanceQueryKey(userId, period),
    queryFn: () => getMyPerformance({ period }),
  });
}
