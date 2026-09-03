import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RosterScreen from '@/features/membership/screens/RosterScreen';

/**
 * SCR-23 Group Detail · Teacher: the group header, the enrollment toggle
 * and the student list (UF §26 "Student row"). An Active row opens that
 * student's raw daily reports (SCR-25, F-DR-06). The Teacher has no
 * recovery view (SCR-31 is Admin's), so Terminated rows stay inert.
 */
export default function TeacherGroupRosterRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RosterScreen
      groupId={id || ''}
      variant="teacher"
      canOpenRecovery={false}
      onActiveMemberPress={(entry) =>
        router.push({
          pathname: '/(app)/teacher/memberships/[id]/daily-reports',
          params: { id: entry.id, name: entry.user.full_name ?? '' },
        })
      }
    />
  );
}
