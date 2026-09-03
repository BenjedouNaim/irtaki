import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { DailyReportHistoryList } from '../components/DailyReportHistoryList';

export interface RawDailyReportsScreenProps {
  /** The membership whose list is shown — the id the roster row carried. */
  membershipId: string;
  /** The student's name as the roster row showed it; names the screen. */
  studentName?: string | null;
  /** Row tap → SCR-15 rendered from that row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
}

/**
 * SCR-25 Raw Daily Reports (Figma 38:297; F-DR-06, UF §27 / §28): the
 * Teacher's read-only list of one student's daily reports, "Same as Report
 * History" — the SCR-14 list component reused verbatim (UF §15) with
 * API-032 as its data source. The frame's Daily/Weekly SegmentedControl is
 * not rendered: no staff weekly-report screen exists in the app (only the
 * Student's own weekly history does), so there is nothing to switch to.
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
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="raw-daily-reports-screen"
    >
      <TopBar
        title={studentName ? `تقارير ${studentName}` : 'التقارير اليومية'}
        onBack={goBack}
        testID="raw-daily-reports-top-bar"
      />

      <View
        className="flex-1 px-4 pt-1 pb-6 gap-3.5"
        testID="raw-daily-reports-content"
      >
        <View className={`${rowStart} items-center justify-between w-full`}>
          <Text
            className={`${typography.headingSm} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
            testID="raw-daily-reports-title"
          >
            التقارير اليومية
          </Text>
          <Text
            className={`${typography.caption} text-left text-fg-tertiary dark:text-fg-tertiary-dark`}
          >
            للقراءة فقط
          </Text>
        </View>

        <View className="flex-1">
          <DailyReportHistoryList
            membershipId={membershipId}
            onOpenReport={onOpenReport}
            testID="raw-daily-reports"
          />
        </View>
      </View>
    </View>
  );
}
