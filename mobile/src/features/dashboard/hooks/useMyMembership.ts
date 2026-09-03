import { useQuery } from '@tanstack/react-query';
import {
  getMyMembership,
  OwnMembershipDto,
} from '@/shared/api/memberships.client';
import { useAuthStore } from '@/shared/auth';

/** Account-scoped query key for `GET /memberships/mine` (API-025). */
export function myMembershipQueryKey(userId?: string | null) {
  return ['memberships', 'mine', userId ?? 'anonymous'] as const;
}

/**
 * The Student's own Active membership — group name and recitation day for
 * the SCR-08 greeting header. A `404` (no active membership) is simply an
 * absent subtitle, never an error banner: the Daily CTA already states the
 * reason (API-029 `block_reason`).
 */
export function useMyMembership() {
  const userId = useAuthStore((s) => s.userId);
  return useQuery<OwnMembershipDto, Error>({
    queryKey: myMembershipQueryKey(userId),
    queryFn: getMyMembership,
  });
}
