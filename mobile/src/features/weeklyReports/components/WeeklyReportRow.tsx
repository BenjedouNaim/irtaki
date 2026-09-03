import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';

export interface WeeklyReportRowProps {
  report: WeeklyReportDto;
  onPress?: (report: WeeklyReportDto) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Same wording as SCR-12's attendance line (UF §33: one term per concept). */
export const ATTENDANCE_LABELS = {
  attended: 'حضر جلسة التسميع',
  missed: 'لم يحضر جلسة التسميع',
} as const;

/** Same phrasing as SCR-12's header range line. */
export function describeWeekRange(report: WeeklyReportDto): string {
  return `من ${report.week_start} إلى ${report.week_end}`;
}

/**
 * One-line factual summary derived only from the row itself: the stored
 * `missed_daily_reports` against the stored `expected_days` — no
 * arithmetic, no rounding (UF §36).
 */
export function describeWeeklyReport(report: WeeklyReportDto): string {
  return `التقارير اليومية الفائتة: ${report.missed_daily_reports} من ${report.expected_days}`;
}

/**
 * SCR-14 Weekly sub-tab list row (UF §28 "List row"): the week range on
 * the reading side, a factual summary under it, the attendance badge on
 * the far side — dot + text, never colour alone (UF §32). 48dp+ target;
 * the whole row is the button. Tap → the read-only weekly detail rendered
 * from this very row (UF §26 "Weekly sub-tab → Detail (read-only)").
 */
export function WeeklyReportRow({
  report,
  onPress,
  testID,
  style,
}: WeeklyReportRowProps) {
  const rowTestID = testID ?? `weekly-report-row-${report.id}`;
  const range = describeWeekRange(report);
  const summary = describeWeeklyReport(report);
  const attendance = report.attended_recitation_call
    ? ATTENDANCE_LABELS.attended
    : ATTENDANCE_LABELS.missed;

  return (
    <Pressable
      testID={rowTestID}
      accessibilityRole="button"
      accessibilityLabel={`تقرير الأسبوع ${range}: ${attendance}. ${summary}`}
      onPress={() => onPress?.(report)}
      className="flex-row-reverse items-center justify-between min-h-[64px] px-4 py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-3"
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-1 gap-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-gray-100 text-right"
          style={{ fontVariant: ['tabular-nums'] }}
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-range`}
        >
          {range}
        </Text>
        <Text
          className="text-sm text-gray-600 dark:text-gray-400 text-right"
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-summary`}
        >
          {summary}
        </Text>
      </View>
      <View className="flex-row-reverse items-center gap-2">
        <StatusBadge
          status={attendance}
          variant={report.attended_recitation_call ? 'success' : 'warning'}
          testID={`${rowTestID}-attendance`}
        />
        {/* Directional chevron: "advance" is leftward in RTL (UF §31). */}
        <Text
          className="text-lg text-gray-400 dark:text-gray-600"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          ‹
        </Text>
      </View>
    </Pressable>
  );
}
