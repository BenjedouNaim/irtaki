import React, { ReactNode, useState } from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { Donut } from '@/shared/components/Donut';
import { Icon } from '@/shared/components/Icon';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';
import { MetricTile } from '@/shared/components/MetricTile';
import {
  SegmentedControl,
  SegmentedControlOption,
} from '@/shared/components/SegmentedControl';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import {
  PerformanceDayBreakdownDto,
  PerformanceDto,
  PerformancePeriod,
} from '@/shared/api/performance.client';
import { useMyPerformance } from '@/features/performance/hooks/useMyPerformance';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';

export interface PerformanceSectionProps {
  /**
   * Rendered between the commitment-score card and the day-breakdown card —
   * the slot Figma 30:553 fills with the memorization card (F-PRG-02's
   * `ProgressSection`), so SCR-13 keeps its designed order while the two
   * features keep their own queries.
   */
  children?: ReactNode;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Network unavailable (UF §24) — the same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل بيانات الأداء';

/** Metric text must survive OS text scaling without clipping (UF §32). */
const METRIC_MAX_FONT_SIZE_MULTIPLIER = 1.5;

/** UF §17: "Days since last report — number, red at ≥3". */
export const DAYS_SINCE_ALERT_THRESHOLD = 3;

const DAYS_SINCE_ALERT_LABEL = 'لم تُسجَّل تقارير لثلاثة أيام متوقعة أو أكثر';

/**
 * The period selector of Figma 30:553 (SegmentedControl Count=4). `custom`
 * appears because the design shows four segments, but SCR-13 has no
 * date-range picker anywhere in the Figma file, so it is present and never
 * selectable — the same posture the Student TabBar takes towards the
 * unbuilt Payment tab.
 */
const PERIOD_OPTIONS: SegmentedControlOption<PerformancePeriod>[] = [
  { label: 'أسبوع', value: 'week' },
  { label: 'شهر', value: 'month' },
  { label: '3 أشهر', value: '3months' },
  { label: 'مخصص', value: 'custom', disabled: true },
];

/** Figma's score caption: the period, then the §17 no-trend-line note. */
const PERIOD_CAPTION: Record<PerformancePeriod, string> = {
  week: 'هذا الأسبوع',
  month: 'آخر شهر',
  '3months': 'آخر 3 أشهر',
  custom: 'فترة مخصصة',
};

/** UF §17 API GAP: the trend line is omitted for MVP — the card says so. */
const NO_TREND_NOTE = 'لا يوجد خط اتجاه في هذه النسخة';

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table.
 * `5xx` and network failures show generic copy; the server string is never
 * shown. `401` is refreshed silently by the API client; `403` is unreachable
 * for a Student on their own route. Any remaining `4xx` carries the exception
 * filter's Arabic message, as elsewhere.
 */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return SERVER_ERROR_MESSAGE;
    }
    return error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * A rate as a whole-percent string, or `null` for the null-safe rendering.
 * Every rate is nullable and `null` NEVER becomes `0%` (DEC-B04, UF §17).
 */
function formatRate(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate)}%`;
}

/**
 * Figma Donut legend (19:60), in the palette order the component applies by
 * position: Normal · Revision · Excused · Unexcused · Missed. Never labelled
 * "Memorized" — a Normal day can legally contain neither (BR-48).
 */
function toDonutSegments(breakdown: PerformanceDayBreakdownDto) {
  return [
    { key: 'normal', label: 'عادي', value: breakdown.normal },
    { key: 'revision', label: 'مراجعة', value: breakdown.revision },
    {
      key: 'absent_excused',
      label: 'غياب بعذر',
      value: breakdown.absent_excused,
    },
    {
      key: 'absent_other',
      label: 'غياب بدون عذر',
      value: breakdown.absent_other,
    },
    { key: 'no_report', label: 'فائت', value: breakdown.no_report },
  ];
}

const CARD =
  'w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark';

/**
 * SCR-13's Performance section (F-PERF-01, UF §17; Figma 30:553): the period
 * selector, the commitment-score card, the day-breakdown donut, the
 * repetition-quality and recitation-attendance tiles and the days-since row.
 * Assembles around F-PRG-02's memorization card, passed as `children`.
 *
 * Every rate arrives nullable from API-037 and renders "بيانات غير كافية",
 * never `0%` (DEC-B04 / API-X07). `repetition_quality` and
 * `attendance_rate` are shown standalone, never folded into the score
 * (SAS §18.3).
 */
export function PerformanceSection({
  children,
  testID = 'performance-section',
  className,
  style,
}: PerformanceSectionProps) {
  const [period, setPeriod] = useState<PerformancePeriod>('week');
  const { data, isLoading, isError, error, refetch } = useMyPerformance(period);

  const showSkeleton = isLoading && !data;
  const showError = isError && !data;

  return (
    <View
      testID={testID}
      className={`w-full gap-4 ${className ?? ''}`}
      style={style}
    >
      <SegmentedControl
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
        accessibilityLabel="الفترة"
        testID={`${testID}-period`}
      />

      {showSkeleton ? (
        <SkeletonLoader
          variant="performanceScore"
          testID={`${testID}-score-skeleton`}
        />
      ) : showError ? (
        <Banner
          tone="error"
          message={describeError(error)}
          onRetry={() => void refetch()}
          testID={`${testID}-error`}
        />
      ) : data ? (
        <ScoreCard data={data} period={period} testID={`${testID}-score`} />
      ) : null}

      {children}

      {showSkeleton ? (
        <SkeletonLoader
          variant="performanceDetail"
          testID={`${testID}-detail-skeleton`}
        />
      ) : data ? (
        <PerformanceDetail data={data} testID={testID} />
      ) : null}
    </View>
  );
}

function ScoreCard({
  data,
  period,
  testID,
}: {
  data: PerformanceDto;
  period: PerformancePeriod;
  testID: string;
}) {
  const score = data.commitment_score;
  const isNull = score === null;

  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`نسبة الالتزام: ${
        isNull ? METRIC_NULL_PLACEHOLDER : `${Math.round(score)}٪`
      }`}
      className={`p-5 gap-1.5 ${itemsStart} ${CARD}`}
      style={{ borderCurve: 'continuous' }}
    >
      <Text
        className={`w-full ${typography.labelSm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
      >
        نسبة الالتزام
      </Text>

      {isNull ? (
        <Text
          testID={`${testID}-value`}
          className={`w-full ${typography.headingLg} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
        >
          —
        </Text>
      ) : (
        <View className={`${rowStart} items-end gap-2`}>
          <Text
            testID={`${testID}-value`}
            className={`${typography.displayLg} text-fg dark:text-fg-dark`}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
          >
            {String(Math.round(score))}
          </Text>
          <Text
            className={`${typography.headingLg} text-fg-tertiary dark:text-fg-tertiary-dark`}
            maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
          >
            %
          </Text>
        </View>
      )}

      <Text
        testID={`${testID}-caption`}
        className={`w-full ${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
        maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
      >
        {isNull
          ? METRIC_NULL_PLACEHOLDER
          : `${PERIOD_CAPTION[period]} · ${NO_TREND_NOTE}`}
      </Text>
    </View>
  );
}

function PerformanceDetail({
  data,
  testID,
}: {
  data: PerformanceDto;
  testID: string;
}) {
  const daysSince = data.days_since_last_report;
  const isAlerting = daysSince >= DAYS_SINCE_ALERT_THRESHOLD;

  return (
    <>
      <View
        testID={`${testID}-breakdown`}
        className={`p-5 gap-4 ${itemsStart} ${CARD}`}
        style={{ borderCurve: 'continuous' }}
      >
        <Text
          className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
          accessibilityRole="header"
        >
          توزيع الأيام
        </Text>
        <Donut
          segments={toDonutSegments(data.day_breakdown)}
          testID={`${testID}-donut`}
        />
      </View>

      <View className={`${rowStart} items-start gap-3 w-full`}>
        {/* Standalone quality indicator — never folded into the score. */}
        <MetricTile
          label="جودة التكرار"
          value={formatRate(data.repetition_quality)}
          caption="التكرار 50 مرة"
          testID={`${testID}-quality`}
        />
        <MetricTile
          label="حضور التسميع"
          value={formatRate(data.attendance_rate)}
          caption="مجالس التسميع"
          testID={`${testID}-attendance`}
        />
      </View>

      <View
        testID={`${testID}-days-since`}
        accessibilityRole="text"
        accessibilityLabel={`أيام منذ آخر تقرير: ${daysSince}`}
        className={`${rowStart} items-center justify-between px-5 py-4 ${CARD}`}
        style={{ borderCurve: 'continuous' }}
      >
        <View className={`flex-1 ${rowStart} items-center gap-2`}>
          {isAlerting ? (
            <Icon
              name="alert"
              size={18}
              tone="error"
              accessibilityLabel={DAYS_SINCE_ALERT_LABEL}
              testID={`${testID}-days-since-alert`}
            />
          ) : null}
          <Text
            className={`${typography.bodyMd} text-right ${
              isAlerting
                ? 'text-fg-error'
                : 'text-fg-secondary dark:text-fg-secondary-dark'
            }`}
            maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
          >
            أيام منذ آخر تقرير
          </Text>
        </View>
        <Text
          testID={`${testID}-days-since-value`}
          className={`${typography.headingLg} text-left ${
            isAlerting ? 'text-fg-error' : 'text-fg dark:text-fg-dark'
          }`}
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
        >
          {String(daysSince)}
        </Text>
      </View>
    </>
  );
}
