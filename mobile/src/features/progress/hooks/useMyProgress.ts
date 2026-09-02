import { useQuery } from '@tanstack/react-query';
import { getMyProgress, ProgressDto } from '@/shared/api/progress.client';
import { useAuthStore } from '@/shared/auth';

/**
 * Query key for the caller's own progress (API-041).
 * Exported so report-submission mutations can invalidate it (TS.md §26 — UF §15:
 * a successful daily report "updates Progress tab").
 */
export const MY_PROGRESS_QUERY_KEY = ['progress', 'mine'] as const;

/**
 * Returns the account-scoped query key for the authenticated user,
 * preventing cross-account cache leaks between sessions within staleTime.
 */
export function myProgressQueryKey(userId?: string | null) {
  return [...MY_PROGRESS_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/**
 * Feature hook for the Student's own memorization coverage (F-PRG-02, SCR-13 Progress section).
 * Adheres to TS.md §10/§26/§37 ("screens/components consume hooks, never call the API client directly").
 * Inherits default QueryClient options (5m staleTime, retry 1) from RootLayout.
 */
export function useMyProgress() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<ProgressDto, Error>({
    queryKey: myProgressQueryKey(userId),
    queryFn: getMyProgress,
  });
}
