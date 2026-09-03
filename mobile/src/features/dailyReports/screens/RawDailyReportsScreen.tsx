import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { DailyReportHistoryList } from '../components/DailyReportHistoryList';

export interface RawDailyReportsScreenProps {
  /** The membership whose list is shown — the id the roster row carried. */
  membershipId: string;
  /** The student's name as the roster row showed it; only a header line. */
  studentName?: string | null;
  /** Row tap → SCR-15 rendered from that row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
}

/**
 * SCR-25 Raw Daily Reports (F-DR-06, UF §27 / §28): the Teacher's read-only
 * list of one student's daily reports, "Same as Report History" — the
 * SCR-14 list component reused verbatim (UF §15) with API-032 as its data
 * source; `report_date DESC`, infinite scroll, skeleton rows, the UF §23
 * empty state, and no date-range filter control (UF §15's deliberate
 * omission). Teacher-only in the navigation graph (UF §8) even though the
 * Admin also has backend access — no Admin screen exists in the MVP
 * inventory. Header mirrors SCR-14: title on the reading side, back control
 * top-right (UF §31).
 */
export function RawDailyReportsScreen({
  membershipId,
  studentName,
  onOpenReport,
}: RawDailyReportsScreenProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/teacher');
    }
  };

  return (
    <View
      className="flex-1 bg-white dark:bg-gray-950 p-5 gap-4"
      testID="raw-daily-reports-screen"
    >
      <View className="flex-row-reverse items-center justify-between">
        <View className="flex-1 gap-1">
          <Text
            className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
            accessibilityRole="header"
            testID="raw-daily-reports-title"
          >
            التقارير اليومية
          </Text>
          {studentName ? (
            <Text
              className="text-sm text-gray-500 dark:text-gray-400 text-right"
              testID="raw-daily-reports-student"
            >
              {studentName}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID="raw-daily-reports-back-button"
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

      <View className="flex-1" testID="raw-daily-reports-content">
        <DailyReportHistoryList
          membershipId={membershipId}
          onOpenReport={onOpenReport}
          testID="raw-daily-reports"
        />
      </View>
    </View>
  );
}
