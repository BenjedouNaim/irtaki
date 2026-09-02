import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { RawDailyReportsScreen } from '@/features/dailyReports/screens/RawDailyReportsScreen';

/**
 * SCR-25 Raw Daily Reports — Teacher's roster row tap (UF §26). A row tap
 * opens SCR-15 by id; the detail route reads the row back from this list's
 * cache (F-DR-07: no new request).
 */
export default function TeacherMembershipDailyReportsRoute() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const membershipId = id || '';

  return (
    <RawDailyReportsScreen
      membershipId={membershipId}
      studentName={name || null}
      onOpenReport={(report) =>
        router.push({
          pathname: '/(app)/teacher/memberships/[id]/reports/[reportId]',
          params: { id: membershipId, reportId: report.id },
        })
      }
    />
  );
}
