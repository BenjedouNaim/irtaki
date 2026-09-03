import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import RosterScreen from '@/features/membership/screens/RosterScreen';

/**
 * SCR-23 Group Detail · Teacher: the group header, the enrollment toggle
 * (F-GRP-06) and the Group Performance content — period selector, tiles,
 * absence-reason donut and the weakest-first student list (F-PERF-02).
 *
 * A student row opens that student's raw daily reports (SCR-25, F-DR-06):
 * UF §26 routes the row to SCR-24 Individual Performance first, but that
 * screen is not built, and navigation never offers a screen that is not
 * there (UF §8). The Teacher has no recovery view (SCR-31 is Admin's).
 */
export default function TeacherGroupRosterRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RosterScreen
      groupId={id || ''}
      variant="teacher"
      canOpenRecovery={false}
      onStudentPress={(student) =>
        router.push({
          pathname: '/(app)/teacher/memberships/[id]/daily-reports',
          params: { id: student.membership_id, name: student.full_name ?? '' },
        })
      }
    />
  );
}
