import { useQuery } from '@tanstack/react-query';
import {
  getMembershipProgress,
  ProgressDto,
} from '@/shared/api/progress.client';

/**
 * Query key root for one student's memorization coverage (API-042).
 * Exported so a write that changes coverage can invalidate every
 * membership's card at once (TS §26).
 */
export const MEMBERSHIP_PROGRESS_QUERY_KEY = [
  'progress',
  'membership',
] as const;

/** Membership-scoped key — the resource is the membership, not the reader. */
export function membershipProgressQueryKey(membershipId: string) {
  return [...MEMBERSHIP_PROGRESS_QUERY_KEY, membershipId] as const;
}

/**
 * Feature hook for SCR-24's memorization card (F-PRG-03's endpoint, wired
 * here because UF §28 gives SCR-24 "the same layout as the Progress Tab").
 * Screens and components consume this hook and never call the API client
 * directly (TS §10/§26/§37).
 */
export function useMembershipProgress(
  membershipId: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery<ProgressDto, Error>({
    queryKey: membershipProgressQueryKey(membershipId),
    queryFn: () => getMembershipProgress(membershipId),
    enabled: (options.enabled ?? true) && membershipId.length > 0,
  });
}
