import React from 'react';
import { View } from 'react-native';
import { MetricRow } from '@/shared/components/MetricRow';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import {
  WeeklyReportDto,
  WeeklyReportLiveDto,
  WeeklyReportState,
} from '@/shared/api/weeklyReports.client';

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
  Finalised: { label: 'معتمد', variant: 'success' },
};

/**
 * UF §16: "6 read-only metric counts (missed_daily_reports,
 * missed_daily_memorization, missed_daily_revision, missed_50_repetitions,
 * missed_single_session — plus expected_days context line)". One canonical
 * Arabic term per concept (UF §33): daily revision is distinct from a
 * Revision Period (SAS §17.2).
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
  { key: 'missed_daily_revision', label: 'أيام المراجعة اليومية الفائتة' },
  {
    key: 'missed_50_repetitions',
    label: 'أيام لم تُتمّ فيها التكرارات الخمسون',
  },
  {
    key: 'missed_single_session',
    label: 'أيام لم تكن فيها التكرارات في جلسة واحدة',
  },
];

export interface WeeklyReportMetricsProps {
  report: WeeklyReportMetricsSource;
}

/**
 * The state badge and the Metric row ×6 (UF §28 SCR-12) shared by the
 * Weekly Report screen and its read-only History detail (UF §28 SCR-15:
 * "same layout as submission form, all fields disabled"). Everything shown
 * comes from the row; nothing is inferred. A zero-activity week renders
 * fully, every metric near its max (UF §16).
 */
export function WeeklyReportMetrics({ report }: WeeklyReportMetricsProps) {
  const badge = STATE_BADGE[report.state];
  return (
    <>
      <View className="flex-row-reverse items-center justify-between">
        <StatusBadge
          status={badge.label}
          variant={badge.variant}
          testID="weekly-report-state-badge"
        />
      </View>

      {/* Metric row ×6 (UF §28): expected_days context line + five misses. */}
      <View className="w-full gap-3" testID="weekly-report-metrics">
        <MetricRow
          label="الأيام المتوقعة"
          value={report.expected_days}
          hint="أيام الحفظ المحتسبة هذا الأسبوع (بحد أقصى 6)"
          testID="metric-expected-days"
        />
        {MISSED_METRICS.map(({ key, label }) => (
          <MetricRow
            key={key}
            label={label}
            value={report[key]}
            testID={`metric-${key.replace(/_/g, '-')}`}
          />
        ))}
      </View>
    </>
  );
}
