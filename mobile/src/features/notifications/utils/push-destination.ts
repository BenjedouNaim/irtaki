import type { Href } from 'expo-router';
import type { Role } from '@/shared/auth';
import { homeRouteForRole } from '@/navigation/roleHome';
import type { PushPayload } from './push-payload';

/** UF §8 destinations. Role and resource scope must be refreshed before use. */
export async function pushDestination(
  payload: PushPayload,
  role: Role,
  resolveTeacherGroup: (membershipId: string) => Promise<string | null>,
): Promise<Href> {
  switch (payload.eventType) {
    case 'N-01':
      return role === 'Student'
        ? '/(app)/student/daily-report/type-selection'
        : homeRouteForRole(role);
    case 'N-02':
      return role === 'Student'
        ? '/(app)/student/weekly-report'
        : homeRouteForRole(role);
    case 'N-03':
    case 'N-04':
    case 'N-08':
      return homeRouteForRole(role);
    case 'N-05':
      return role === 'Assistant'
        ? '/(app)/assistant/join-requests'
        : homeRouteForRole(role);
    case 'N-06':
      return role === 'Student'
        ? { pathname: '/(app)/student', params: { tab: 'payment' } }
        : homeRouteForRole(role);
    case 'N-07': {
      if (role !== 'Teacher') return homeRouteForRole(role);
      const groupId = await resolveTeacherGroup(payload.resourceId);
      return groupId
        ? {
            pathname: '/(app)/teacher/groups/[id]/roster',
            params: { id: groupId },
          }
        : homeRouteForRole(role);
    }
  }
}
