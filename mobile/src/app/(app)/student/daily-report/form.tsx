import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
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
        className="flex-1 items-center justify-center p-5 gap-4 bg-white dark:bg-gray-950"
        testID="daily-report-form-invalid-type"
      >
        <Text className="text-base text-gray-700 dark:text-gray-300 text-center">
          يرجى اختيار نوع التقرير أولاً.
        </Text>
        <Button
          label="اختيار نوع التقرير"
          variant="outline"
          onPress={() =>
            router.replace('/(app)/student/daily-report/type-selection')
          }
          testID="daily-report-form-choose-type-button"
        />
      </View>
    );
  }

  return <DailyReportFormScreen type={type} />;
}
