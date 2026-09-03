import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import {
  AbsenceReason,
  DailyReportDto,
  DailyReportType,
} from '@/shared/api/dailyReports.client';

export interface DailyReportRowProps {
  report: DailyReportDto;
  onPress?: (report: DailyReportDto) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** One canonical Arabic term per report type (UF §33), shared with SCR-15. */
export const DAILY_REPORT_TYPE_LABELS: Record<DailyReportType, string> = {
  Normal: 'عادي',
  Revision: 'مراجعة',
  Absent: 'غياب',
};

const TYPE_BADGE_VARIANTS: Record<DailyReportType, StatusBadgeVariant> = {
  Normal: 'info',
  Revision: 'neutral',
  Absent: 'warning',
};

/** Same wording as the SCR-10 reason picker (UF §33 consistency). */
export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  Sick: 'مرض',
  Studying: 'دراسة',
  Other: 'سبب آخر',
};

/**
 * One-line factual summary of what the report contains, derived only from
 * the row itself (no reference-data lookup). A Normal report with neither
 * section is stated as such (BR-48), never hidden.
 */
export function describeDailyReport(report: DailyReportDto): string {
  switch (report.type) {
    case 'Absent':
      return report.absence_reason
        ? `غياب — ${ABSENCE_REASON_LABELS[report.absence_reason]}`
        : 'غياب';
    case 'Revision':
      return 'مراجعة';
    case 'Normal': {
      const memo = report.memo_range !== null;
      const rev = report.rev_range !== null;
      if (memo && rev) return 'حفظ ومراجعة';
      if (memo) return 'حفظ';
      if (rev) return 'مراجعة فقط';
      return 'دون حفظ أو مراجعة';
    }
  }
}

/**
 * SCR-14 list row (UF §28 "List row"): the report date on the reading
 * side, a factual summary under it, the type badge on the far side. 48dp+
 * target; the whole row is the button (UF §32). Tap → SCR-15 read-only
 * detail rendered from this very row (F-DR-07).
 */
export function DailyReportRow({
  report,
  onPress,
  testID,
  style,
}: DailyReportRowProps) {
  const rowTestID = testID ?? `daily-report-row-${report.id}`;
  const typeLabel = DAILY_REPORT_TYPE_LABELS[report.type];
  const summary = describeDailyReport(report);

  return (
    <Pressable
      testID={rowTestID}
      accessibilityRole="button"
      accessibilityLabel={`تقرير ${report.report_date}: ${typeLabel}. ${summary}`}
      onPress={() => onPress?.(report)}
      className="flex-row-reverse items-center justify-between min-h-[64px] px-4 py-3 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-3"
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-1 gap-1">
        <Text
          className="text-base font-bold text-gray-900 dark:text-gray-100 text-right"
          style={{ fontVariant: ['tabular-nums'] }}
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-date`}
        >
          {report.report_date}
        </Text>
        <Text
          className="text-sm text-gray-600 dark:text-gray-400 text-right"
          testID={`${rowTestID}-summary`}
        >
          {summary}
        </Text>
      </View>
      <View className="flex-row-reverse items-center gap-2">
        <StatusBadge
          status={typeLabel}
          variant={TYPE_BADGE_VARIANTS[report.type]}
          testID={`${rowTestID}-type`}
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
