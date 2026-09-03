import React from 'react';
import { View } from 'react-native';
import { MetricRow } from '@/shared/components/MetricRow';
import { StatusBadgeVariant } from '@/shared/components/StatusBadge';
import {
  WeeklyReportDto,
  WeeklyReportFinalisedBy,
  WeeklyReportLiveDto,
  WeeklyReportState,
} from '@/shared/api/weeklyReports.client';
import { itemsStart } from '@/shared/theme/rtl';

/** The fields SCR-12 and its read-only detail both render (UF §16). */
export type WeeklyReportMetricsSource = Pick<
  WeeklyReportLiveDto | WeeklyReportDto,
  | 'expected_days'
  | 'missed_daily_reports'
  | 'missed_daily_memorization'
  | 'missed_daily_revision'
  | 'missed_50_repetitions'
  | 'missed_single_session'
  | 'state'
>;

export const STATE_BADGE: Record<
  WeeklyReportState,
  { label: string; variant: StatusBadgeVariant }
> = {
  Open: { label: 'مفتوح', variant: 'info' },
  Finalised: { label: 'مؤكَّد', variant: 'success' },
};

/**
 * Figma SCR-14 · Weekly badges: confirmed by the Student → "مؤكَّد"
 * (success); closed by the scheduler → "أُغلق تلقائيًا" (neutral).
 */
export function finalisedBadge(finalisedBy: WeeklyReportFinalisedBy | null): {
  label: string;
  variant: StatusBadgeVariant;
} {
  return finalisedBy === 'Scheduler'
    ? { label: 'أُغلق تلقائيًا', variant: 'neutral' }
    : STATE_BADGE.Finalised;
}

/**
 * UF §16: "6 read-only metric counts (missed_daily_reports,
 * missed_daily_memorization, missed_daily_revision, missed_50_repetitions,
 * missed_single_session — plus expected_days context line)". One canonical
 * Arabic term per concept (UF §33, Figma 27:666): daily revision is
 * distinct from a Revision Period (SAS §17.2).
 */
export const MISSED_METRICS: ReadonlyArray<{
  key: keyof Pick<
    WeeklyReportMetricsSource,
    | 'missed_daily_reports'
    | 'missed_daily_memorization'
    | 'missed_daily_revision'
    | 'missed_50_repetitions'
    | 'missed_single_session'
  >;
  label: string;
}> = [
  { key: 'missed_daily_reports', label: 'التقارير اليومية الفائتة' },
  { key: 'missed_daily_memorization', label: 'أيام الحفظ الفائتة' },
  { key: 'missed_daily_revision', label: 'أيام المراجعة الفائتة' },
  { key: 'missed_50_repetitions', label: 'تكرار الـ50 الفائت' },
  { key: 'missed_single_session', label: 'الجلسة الواحدة الفائتة' },
];

export interface WeeklyReportMetricsProps {
  report: WeeklyReportMetricsSource;
  /** Adds the "الأيام المتوقّعة" context row on top (the read-only detail). */
  showExpectedDays?: boolean;
  /** Extra rows appended after the five metrics (e.g. the recorded attendance). */
  children?: React.ReactNode;
  testID?: string;
}

/** Figma 1px border/default separator between metric rows. */
function Divider() {
  return <View className="w-full h-px bg-line dark:bg-line-dark" />;
}

/**
 * Figma "Metrics" card (27:666): surface, 1px border/default, radius lg,
 * MetricRow ×N separated by hairlines — shared by the Weekly Report screen
 * and its read-only History detail (UF §28 SCR-15: "same layout … all
 * fields disabled"). Everything shown comes from the row; nothing is
 * inferred. A zero-activity week renders fully, every metric near its max
 * (UF §16).
 */
export function WeeklyReportMetrics({
  report,
  showExpectedDays = false,
  children,
  testID = 'weekly-report-metrics',
}: WeeklyReportMetricsProps) {
  const rows: React.ReactNode[] = [];
  if (showExpectedDays) {
    rows.push(
      <MetricRow
        key="expected_days"
        label="الأيام المتوقّعة"
        value={report.expected_days}
        testID="metric-expected-days"
      />,
    );
  }
  for (const { key, label } of MISSED_METRICS) {
    rows.push(
      <MetricRow
        key={key}
        label={label}
        value={report[key]}
        testID={`metric-${key.replace(/_/g, '-')}`}
      />,
    );
  }
  React.Children.forEach(children, (child, index) => {
    if (child)
      rows.push(
        <React.Fragment key={`extra-${index}`}>{child}</React.Fragment>,
      );
  });

  return (
    <View
      testID={testID}
      className={`w-full px-4 py-2 gap-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
      style={{ borderCurve: 'continuous' }}
    >
      {rows.map((row, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <Divider /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}
