import { useQuery } from '@tanstack/react-query';
import { getMe, MeResponse } from '@/shared/api/me.client';
import { useAuthStore } from '@/shared/auth';

/** Account-scoped query key for `GET /me` (API-007). */
export function meQueryKey(userId?: string | null) {
  return ['me', userId ?? 'anonymous'] as const;
}

/**
 * The caller's own profile for the SCR-08 greeting header (name + avatar
 * initial). Screens consume hooks, never the client directly (TS §26/§37);
 * inherits the RootLayout QueryClient defaults.
 */
export function useMe() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<MeResponse, Error>({
    queryKey: meQueryKey(userId),
    queryFn: getMe,
  });
}
