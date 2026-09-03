import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { WeeklyReportDetailScreen } from '@/features/weeklyReports/screens/WeeklyReportDetailScreen';
import { useCachedWeeklyReport } from '@/features/weeklyReports/hooks/useCachedWeeklyReport';

/**
 * Read-only weekly detail — SCR-14 Weekly sub-tab row tap (UF §26 "Weekly
 * sub-tab → Detail (read-only)"). The route carries only the id; the row
 * itself comes from the history cache the tapping list already filled (no
 * new endpoint, no new request — the F-DR-07 pattern). If the id is in no
 * cache — a cold deep link, or the list was evicted — the route offers the
 * way back to the history rather than inventing a fetch.
 */
export default function WeeklyReportDetailRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const report = useCachedWeeklyReport(id);

  if (!report) {
    return (
      <View
        className="flex-1 items-center justify-center p-5 gap-4 bg-white dark:bg-gray-950"
        testID="weekly-report-detail-unavailable"
      >
        <Text className="text-base text-gray-700 dark:text-gray-300 text-center">
          هذا التقرير غير متاح حالياً. افتحه من سجل التقارير.
        </Text>
        <Button
          label="فتح سجل التقارير"
          variant="outline"
          onPress={() => router.replace('/(app)/student/reports/history')}
          testID="weekly-report-detail-open-history-button"
        />
      </View>
    );
  }

  return <WeeklyReportDetailScreen report={report} />;
}
