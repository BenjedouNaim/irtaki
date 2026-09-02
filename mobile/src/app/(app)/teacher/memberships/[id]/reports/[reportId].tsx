import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { ReportDetailScreen } from '@/features/dailyReports/screens/ReportDetailScreen';
import { useCachedDailyReport } from '@/features/dailyReports/hooks/useCachedDailyReport';

/**
 * SCR-15 Report Detail reached from SCR-25 (UF §28: Teacher, scoped). The
 * route carries the membership and report ids only; the row itself comes
 * from the SCR-25 list cache (F-DR-07: no new endpoint, no new request).
 * If the id is in no cache — a cold deep link, or the list was evicted —
 * the route offers the way back to the list rather than inventing a fetch.
 */
export default function TeacherReportDetailRoute() {
  const router = useRouter();
  const { id, reportId } = useLocalSearchParams<{
    id: string;
    reportId?: string;
  }>();
  const membershipId = id || '';
  const report = useCachedDailyReport(reportId, membershipId);

  if (!report) {
    return (
      <View
        className="flex-1 items-center justify-center p-5 gap-4 bg-white dark:bg-gray-950"
        testID="report-detail-unavailable"
      >
        <Text className="text-base text-gray-700 dark:text-gray-300 text-center">
          هذا التقرير غير متاح حالياً. افتحه من قائمة التقارير اليومية.
        </Text>
        <Button
          label="فتح التقارير اليومية"
          variant="outline"
          onPress={() =>
            router.replace({
              pathname: '/(app)/teacher/memberships/[id]/daily-reports',
              params: { id: membershipId },
            })
          }
          testID="report-detail-open-list-button"
        />
      </View>
    );
  }

  return <ReportDetailScreen report={report} homeHref="/(app)/teacher" />;
}
