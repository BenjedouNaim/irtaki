import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RosterScreen from '@/features/membership/screens/RosterScreen';

/**
 * SCR-23 Group Detail · Teacher: the group header, the enrollment toggle
 * (F-GRP-06) and the Group Performance content — period selector, tiles,
 * absence-reason donut and the weakest-first student list (F-PERF-02).
 *
 * A student row opens that student's dashboard (SCR-24, F-PERF-03) — UF §27's
 * "Group Detail row tap" — carrying the roster fields SCR-24's header shows.
 * SCR-24 continues to the raw reports (SCR-25). The Teacher has no recovery
 * view (SCR-31 is Admin's).
 */
export default function TeacherGroupRosterRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RosterScreen
      groupId={id || ''}
      variant="teacher"
      canOpenRecovery={false}
      onStudentPress={(student, context) =>
        router.push({
          pathname: '/(app)/teacher/memberships/[id]/performance',
          params: {
            id: student.membership_id,
            name: student.full_name ?? '',
            gender: context.gender ?? '',
            groupName: context.groupName ?? '',
            startedAt: context.startedAt ?? '',
          },
        })
      }
    />
  );
}
