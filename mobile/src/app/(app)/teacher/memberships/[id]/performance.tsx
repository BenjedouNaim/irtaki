import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IndividualPerformanceScreen } from '@/features/performance/screens/IndividualPerformanceScreen';

/**
 * SCR-24 Individual Performance — SCR-23's student row tap (UF §27 "Group
 * Detail row tap"). The row's own fields travel as params rather than being
 * re-fetched: SCR-23 already loaded the roster and the group (F-PERF-02),
 * and no endpoint returns a single membership to staff.
 *
 * From here the "عرض التقارير الخام" link continues to SCR-25 (F-DR-06),
 * the frame's own destination.
 */
export default function TeacherMembershipPerformanceRoute() {
  const router = useRouter();
  const { id, name, gender, groupName, startedAt } = useLocalSearchParams<{
    id: string;
    name?: string;
    gender?: string;
    groupName?: string;
    startedAt?: string;
  }>();
  const membershipId = id || '';

  return (
    <IndividualPerformanceScreen
      membershipId={membershipId}
      studentName={name || null}
      gender={gender || null}
      groupName={groupName || null}
      startedAt={startedAt || null}
      onOpenRawReports={() =>
        router.push({
          pathname: '/(app)/teacher/memberships/[id]/daily-reports',
          params: { id: membershipId, name: name ?? '' },
        })
      }
    />
  );
}
