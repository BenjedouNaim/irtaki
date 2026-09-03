import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { EmptyState } from '@/shared/components/EmptyState';
import { DailyReportFormScreen } from '@/features/dailyReports/screens/DailyReportFormScreen';
import { isDailyReportType } from '@/features/dailyReports/utils/dailyReportForm';

/**
 * SCR-10 Daily Report Form — Type Selection → Form (UF §26). The chosen
 * type travels as a route param; an unknown value is not a designed path,
 * so the route sends the student back to SCR-09 rather than guessing.
 */
export default function DailyReportFormRoute() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();

  if (!isDailyReportType(type)) {
    return (
      <View
        className="flex-1 justify-center px-4 bg-canvas dark:bg-canvas-dark"
        testID="daily-report-form-invalid-type"
      >
        <EmptyState message="يرجى اختيار نوع التقرير أولاً." icon="pen">
          <Button
            label="اختيار نوع التقرير"
            variant="outline"
            onPress={() =>
              router.replace('/(app)/student/daily-report/type-selection')
            }
            testID="daily-report-form-choose-type-button"
            className="mt-2"
          />
        </EmptyState>
      </View>
    );
  }

  return <DailyReportFormScreen type={type} />;
}
