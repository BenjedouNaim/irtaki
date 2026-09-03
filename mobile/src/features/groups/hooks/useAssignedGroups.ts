import { useQuery } from '@tanstack/react-query';
import { GroupListItem, listGroups } from '@/shared/api/groups.client';

/**
 * Query key for `GET /groups` (API-021), whose result is role-shaped by the
 * server: for staff it is exactly the groups they are assigned to.
 */
export const ASSIGNED_GROUPS_QUERY_KEY = ['groups', 'assigned'] as const;

/**
 * The caller's assigned groups. Used by SCR-20 to pick which group's
 * payment ledger to show — UF §18's group selector appears only above one
 * (TS §10/§26/§37: screens consume hooks, never the API client directly).
 */
export function useAssignedGroups() {
  return useQuery<GroupListItem[], Error>({
    queryKey: ASSIGNED_GROUPS_QUERY_KEY,
    queryFn: async () => (await listGroups()).data,
  });
}
