import React from 'react';
import { useRouter } from 'expo-router';
import { ReportTypeSelectionScreen } from '@/features/dailyReports/screens/ReportTypeSelectionScreen';

/**
 * SCR-09 Report Type Selection — Student Home → "Submit Today's Report"
 * (UF §26). A chosen type opens SCR-10 (Daily Report Form, F-DR-02).
 */
export default function ReportTypeSelectionRoute() {
  const router = useRouter();

  return (
    <ReportTypeSelectionScreen
      onSelectType={(type) =>
        router.push({
          pathname: '/(app)/student/daily-report/form',
          params: { type },
        })
      }
    />
  );
}
