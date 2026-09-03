import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon } from '@/shared/components/Icon';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import { formatArabicWeekRange } from '@/features/dailyReports/utils/arabicDate';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { finalisedBadge } from './WeeklyReportMetrics';

export interface WeeklyReportRowProps {
  report: WeeklyReportDto;
  onPress?: (report: WeeklyReportDto) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/** Figma SCR-14 · Weekly summary tail (UF §33: one term per concept). */
export const ATTENDANCE_LABELS = {
  attended: 'حضر التسميع',
  missed: 'لم يحضر',
} as const;

/** "أسبوع 21 — 27 أوت" — same phrasing as the SCR-12 heading. */
export function describeWeekRange(report: WeeklyReportDto): string {
  return formatArabicWeekRange(report.week_start, report.week_end);
}

/** Arabic count noun for missed daily reports: 1 تقرير · 3–10 تقارير · 11+ تقريرًا (2 is the dual "تقريران"). */
function reportsNoun(count: number): string {
  if (count === 1) return 'تقرير';
  if (count >= 3 && count <= 10) return 'تقارير';
  return 'تقريرًا';
}

/**
 * One-line factual summary derived only from the row itself (Figma:
 * "فائت: 1 تقرير · 2 مراجعة · حضر التسميع"): the stored
 * `missed_daily_reports`, the stored `missed_daily_revision` when non-zero,
 * and the attendance answer as text — never colour alone (UF §32).
 */
export function describeWeeklyReport(report: WeeklyReportDto): string {
  const missed = report.missed_daily_reports;
  const parts = [
    missed === 0
      ? 'فائت: 0'
      : missed === 2
        ? 'فائت: تقريران'
        : `فائت: ${missed} ${reportsNoun(missed)}`,
  ];
  if (report.missed_daily_revision > 0) {
    parts.push(`${report.missed_daily_revision} مراجعة`);
  }
  parts.push(
    report.attended_recitation_call
      ? ATTENDANCE_LABELS.attended
      : ATTENDANCE_LABELS.missed,
  );
  return parts.join(' · ');
}

/**
 * Figma SCR-14 weekly row (31:892): surface card, 1px border/default,
 * radius md — 36px book tile (right), the week range in body/md-medium
 * over the summary in body/sm, the finalisation StatusBadge ("مؤكَّد" /
 * "أُغلق تلقائيًا") and a chevron (left). 48dp+ target; the whole row is
 * the button. Tap → the read-only weekly detail rendered from this very
 * row (UF §26 "Weekly sub-tab → Detail (read-only)").
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
  const badge = finalisedBadge(report.finalised_by);

  return (
    <Pressable
      testID={rowTestID}
      accessibilityRole="button"
      accessibilityLabel={`${range}: ${badge.label}. ${summary}`}
      onPress={() => onPress?.(report)}
      className={`w-full ${rowStart} items-center gap-3 px-4 py-3.5 min-h-[64px] rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark active:opacity-80`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        className="w-9 h-9 rounded-sm bg-subtle dark:bg-subtle-dark items-center justify-center"
        style={{ borderCurve: 'continuous' }}
      >
        <Icon name="book" size={18} tone="secondary" />
      </View>
      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-range`}
        >
          {range}
        </Text>
        <Text
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-summary`}
        >
          {summary}
        </Text>
      </View>
      <StatusBadge
        status={badge.label}
        variant={badge.variant}
        testID={`${rowTestID}-attendance`}
      />
      {/* Directional chevron: "advance" is leftward in RTL (UF §31). */}
      <Icon name="chevron-left" size={18} tone="tertiary" />
    </Pressable>
  );
}
