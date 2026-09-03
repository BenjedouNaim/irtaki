import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { EmptyState } from '@/shared/components/EmptyState';
import { ReportDetailScreen } from '@/features/dailyReports/screens/ReportDetailScreen';
import { useCachedDailyReport } from '@/features/dailyReports/hooks/useCachedDailyReport';

/**
 * SCR-15 Report Detail — History row tap / Home "View Today's Report"
 * (UF §26, §10). The route carries only the id; the row itself comes from
 * the cache the tapping list already filled (F-DR-07: no new endpoint, no
 * new request). If the id is in no cache — a cold deep link, or the list
 * was evicted — the route offers the way back to the history rather than
 * inventing a fetch.
 */
export default function ReportDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const report = useCachedDailyReport(id);

  if (!report) {
    return (
      <View
        className="flex-1 justify-center px-4 bg-canvas dark:bg-canvas-dark"
        testID="report-detail-unavailable"
      >
        <EmptyState
          message="هذا التقرير غير متاح حالياً. افتحه من سجل التقارير."
          icon="file-text"
        >
          <Button
            label="فتح سجل التقارير"
            variant="outline"
            onPress={() => router.replace('/(app)/student/reports/history')}
            testID="report-detail-open-history-button"
            className="mt-2"
          />
        </EmptyState>
      </View>
    );
  }

  return <ReportDetailScreen report={report} />;
}
