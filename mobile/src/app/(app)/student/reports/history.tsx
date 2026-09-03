import React from 'react';
import { useRouter } from 'expo-router';
import { ReportHistoryScreen } from '@/features/dailyReports/screens/ReportHistoryScreen';

/**
 * SCR-14 Report History — Progress tab → History (UF §26). A daily row tap
 * opens SCR-15 by id, a weekly row tap the read-only weekly detail by id;
 * both detail routes read the row back from the history cache that the
 * tapping list filled (F-DR-07: no new request).
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
      onOpenWeeklyReport={(report) =>
        router.push({
          pathname: '/(app)/student/weekly-reports/[id]',
          params: { id: report.id },
        })
      }
    />
  );
}
