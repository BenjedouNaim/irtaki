import React from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Icon, IconName } from '@/shared/components/Icon';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import {
  DailyReportDto,
  DailyReportType,
} from '@/shared/api/dailyReports.client';
import { SurahDto } from '@/shared/api/quran.client';
import { formatAyahRange } from '@/features/progress/utils/ayahRange';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { ABSENCE_REASON_LABELS } from './AbsenceReasonPicker';
import { formatArabicDate } from '../utils/arabicDate';

export { ABSENCE_REASON_LABELS };

export interface DailyReportRowProps {
  report: DailyReportDto;
  /** Surah reference data for the summary; numbers are used while it loads. */
  surahIndex?: Map<number, SurahDto>;
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

const TYPE_ICONS: Record<DailyReportType, IconName> = {
  Normal: 'pen',
  Revision: 'repeat',
  Absent: 'user-x',
};

const EMPTY_INDEX = new Map<number, SurahDto>();

/**
 * Figma SCR-14 badge per row: Normal (success) · Revision (info) · excused
 * absence "غياب بعذر" (neutral, BR-24) · "يوم فائت" for an Other absence
 * (error, BR-25). Dot + text, never colour alone (UF §32).
 */
export function dailyReportBadge(report: DailyReportDto): {
  label: string;
  variant: StatusBadgeVariant;
} {
  switch (report.type) {
    case 'Normal':
      return { label: DAILY_REPORT_TYPE_LABELS.Normal, variant: 'success' };
    case 'Revision':
      return { label: DAILY_REPORT_TYPE_LABELS.Revision, variant: 'info' };
    case 'Absent':
      return report.absence_reason === 'Other'
        ? { label: 'يوم فائت', variant: 'error' }
        : { label: 'غياب بعذر', variant: 'neutral' };
  }
}

/**
 * One-line factual summary of what the report contains (Figma: "حفظ: البقرة
 * 62 ← 81 · مراجعة: الفاتحة 1 ← 7"), derived only from the row itself plus
 * the cached surah names. A Normal report with neither section is stated
 * as such (BR-48), never hidden.
 */
export function describeDailyReport(
  report: DailyReportDto,
  surahIndex: Map<number, SurahDto> = EMPTY_INDEX,
): string {
  const range = (value: NonNullable<DailyReportDto['memo_range']>) =>
    formatAyahRange(surahIndex, value, { collapse: true });

  switch (report.type) {
    case 'Absent':
      return report.absence_reason
        ? `غياب — ${ABSENCE_REASON_LABELS[report.absence_reason]}`
        : 'غياب';
    case 'Revision':
      return report.rev_range ? `مراجعة: ${range(report.rev_range)}` : 'مراجعة';
    case 'Normal': {
      const memo = report.memo_range
        ? `حفظ: ${range(report.memo_range)}`
        : null;
      const rev = report.rev_range
        ? `مراجعة: ${range(report.rev_range)}`
        : null;
      if (memo && rev) return `${memo} · ${rev}`;
      if (memo) return `${memo} · بدون مراجعة`;
      if (rev) return `بدون حفظ · ${rev}`;
      return 'دون حفظ أو مراجعة';
    }
  }
}

/**
 * Figma SCR-14 daily row (31:782): surface card, 1px border/default,
 * radius md — 36px icon tile (right), the day "الثلاثاء 2 سبتمبر" in
 * body/md-medium over the summary in body/sm, the type StatusBadge and a
 * chevron (left). 48dp+ target; the whole row is the button (UF §32).
 * Tap → SCR-15 read-only detail rendered from this very row (F-DR-07).
 */
export function DailyReportRow({
  report,
  surahIndex,
  onPress,
  testID,
  style,
}: DailyReportRowProps) {
  const rowTestID = testID ?? `daily-report-row-${report.id}`;
  const badge = dailyReportBadge(report);
  const summary = describeDailyReport(report, surahIndex);
  const day = formatArabicDate(report.report_date);

  return (
    <Pressable
      testID={rowTestID}
      accessibilityRole="button"
      accessibilityLabel={`تقرير ${day}: ${badge.label}. ${summary}`}
      onPress={() => onPress?.(report)}
      className={`w-full ${rowStart} items-center gap-3 px-4 py-3.5 min-h-[64px] rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark active:opacity-80`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View
        className="w-9 h-9 rounded-sm bg-subtle dark:bg-subtle-dark items-center justify-center"
        style={{ borderCurve: 'continuous' }}
      >
        <Icon name={TYPE_ICONS[report.type]} size={18} tone="secondary" />
      </View>
      <View className={`flex-1 gap-0.5 ${itemsStart}`}>
        <Text
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
          maxFontSizeMultiplier={1.6}
          testID={`${rowTestID}-date`}
        >
          {day}
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
        testID={`${rowTestID}-type`}
      />
      {/* Directional chevron: "advance" is leftward in RTL (UF §31). */}
      <Icon name="chevron-left" size={18} tone="tertiary" />
    </Pressable>
  );
}
