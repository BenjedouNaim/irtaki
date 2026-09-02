import React from 'react';
import { useRouter } from 'expo-router';
import { ReportHistoryScreen } from '@/features/dailyReports/screens/ReportHistoryScreen';

/**
 * SCR-14 Report History — Progress tab → History (UF §26). A row tap opens
 * SCR-15 by id; the detail route reads the row back from the history cache
 * (F-DR-07: no new request).
 */
export default function ReportHistoryRoute() {
  const router = useRouter();

  return (
    <ReportHistoryScreen
      onOpenReport={(report) =>
        router.push({
          pathname: '/(app)/student/reports/[id]',
          params: { id: report.id },
        })
      }
    />
  );
}
