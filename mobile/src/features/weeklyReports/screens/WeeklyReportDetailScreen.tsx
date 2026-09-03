import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import { WeeklyReportMetrics } from '../components/WeeklyReportMetrics';

export interface WeeklyReportDetailScreenProps {
  /** The already-fetched row (no endpoint of its own — UF §26 Detail). */
  report: WeeklyReportDto;
  /** Where "back" lands when there is no navigation history. */
  homeHref?: Href;
}

/**
 * SCR-15 Report Detail, weekly variant (UF §26 "Weekly sub-tab → Detail
 * (read-only)", UF §28 "Same layout as submission form, all fields
 * disabled"): SCR-12's header, week range, state badge and Metric row ×6
 * rendered read-only from the row the history list already holds, plus
 * the finalised note with the recorded attendance answer. This screen owns
 * no query and makes no request; there is no confirm, no editing path
 * (FR-WR-07: a finalised weekly report is immutable).
 */
export function WeeklyReportDetailScreen({
  report,
  homeHref = '/(app)/student',
}: WeeklyReportDetailScreenProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homeHref);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 20 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="weekly-report-detail-screen"
    >
      <View className="w-full max-w-md self-center gap-5">
        <View className="flex-row-reverse items-center justify-between">
          <View className="flex-1 gap-1">
            <Text
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
              accessibilityRole="header"
              testID="weekly-report-detail-title"
            >
              التقرير الأسبوعي
            </Text>
            <Text
              className="text-sm text-gray-500 dark:text-gray-400 text-right"
              style={{ fontVariant: ['tabular-nums'] }}
              testID="weekly-report-detail-week-range"
            >
              {`من ${report.week_start} إلى ${report.week_end}`}
            </Text>
          </View>
          <Pressable
            testID="weekly-report-detail-back-button"
            accessibilityRole="button"
            accessibilityLabel="العودة"
            onPress={goBack}
            className="min-h-[48px] min-w-[48px] items-center justify-center rounded-full active:bg-gray-100 dark:active:bg-gray-800"
          >
            <Text className="text-xl font-bold text-gray-800 dark:text-gray-200">
              →
            </Text>
          </Pressable>
        </View>

        <View className="w-full gap-4" testID="weekly-report-detail-content">
          <WeeklyReportMetrics report={report} />

          <View
            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-1"
            style={{ borderCurve: 'continuous' }}
            testID="weekly-report-detail-finalised-note"
          >
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">
              تم اعتماد هذا التقرير ولا يمكن تعديله.
            </Text>
            <Text
              className="text-sm text-gray-600 dark:text-gray-400 text-right"
              testID="weekly-report-detail-attended-line"
            >
              {`حضور جلسة التسميع: ${
                report.attended_recitation_call ? 'نعم' : 'لا'
              }`}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
