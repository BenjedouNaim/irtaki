import React, { useState } from 'react';
import { View, Text, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { Donut } from '@/shared/components/Donut';
import { EmptyState } from '@/shared/components/EmptyState';
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
  GroupAbsenceBreakdownDto,
  GroupPerformanceDto,
  GroupStudentPerformanceDto,
  PerformancePeriod,
} from '@/shared/api/performance.client';
import { useGroupPerformance } from '@/features/performance/hooks/useGroupPerformance';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { formatArabicCount, STUDENT_COUNT_FORMS } from '@/shared/utils/format';

export interface GroupPerformanceSectionProps {
  groupId: string;
  /**
   * Student row tap. SCR-23's rows lead to that student's dashboard
   * (UF §26); until SCR-24 exists the host screen decides the destination,
   * and without a handler the rows are not tappable — navigation never
   * offers a screen that is not there (UF §8).
   */
  onStudentPress?: (student: GroupStudentPerformanceDto) => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Network unavailable (UF §24) — the same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل أداء المجموعة';

/** UF §23 — factual, no CTA. */
const EMPTY_MESSAGE = 'لا طلاب في هذه المجموعة خلال هذه الفترة';

/** Metric text must survive OS text scaling without clipping (UF §32). */
const METRIC_MAX_FONT_SIZE_MULTIPLIER = 1.5;

/**
 * The period selector of Figma 37:124 (SegmentedControl Count=4). `custom`
 * appears because the design shows four segments, but SCR-23 has no
 * date-range picker anywhere in the Figma file, so it is present and never
 * selectable — the same posture SCR-13's Performance section takes.
 */
const PERIOD_OPTIONS: SegmentedControlOption<PerformancePeriod>[] = [
  { label: 'أسبوع', value: 'week' },
  { label: 'شهر', value: 'month' },
  { label: '3 أشهر', value: '3months' },
  { label: 'مخصص', value: 'custom', disabled: true },
];

/** Figma's tile caption for the submission rate, per selected period. */
const PERIOD_CAPTION: Record<PerformancePeriod, string> = {
  week: 'الأسبوع الحالي',
  month: 'آخر شهر',
  '3months': 'آخر 3 أشهر',
  custom: 'فترة مخصصة',
};

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table.
 * `5xx` and network failures show generic copy; the server string is never
 * shown. `403`/`404` are unreachable — navigation never offers an
 * out-of-scope group (UF §24) — but a stale link still gets the filter's
 * Arabic message rather than a blank card.
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
 * A rate as a whole-percent string, or `null` for the null-safe rendering
 * MetricTile applies. Every rate is nullable and `null` NEVER becomes `0%`
 * (DEC-B04, UF §17).
 */
function formatRate(rate: number | null): string | null {
  return rate === null ? null : `${Math.round(rate)}%`;
}

/**
 * Figma's absence legend (37:188), in the palette order the Donut applies by
 * position. Only the three VR-19 reasons API-038 returns are drawn — the
 * design's two extra legend rows would need day-classification counts the
 * endpoint does not carry, and a fabricated number is worse than an absent
 * one.
 */
function toAbsenceSegments(breakdown: GroupAbsenceBreakdownDto) {
  return [
    { key: 'sick', label: 'مريض', value: breakdown.sick },
    { key: 'studying', label: 'دراسة', value: breakdown.studying },
    { key: 'other', label: 'سبب آخر', value: breakdown.other },
  ];
}

function initialOf(name: string | null): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed.charAt(0) : '؟';
}

const CARD =
  'w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark';

/**
 * SCR-23's Group Performance content (F-PERF-02, UF §17; Figma 37:124): the
 * period selector, the submission-rate and commitment-average tiles, the
 * absence-reasons donut and the weakest-first student list. Assembles below
 * the group header and the enrollment toggle F-GRP-06 already built.
 *
 * The list arrives ordered and filtered from API-038 and is rendered exactly
 * as returned — the server has already applied FR-PERF-09/10, so a removed
 * student appears on a historical period and never on the current week
 * (UF §17). Every rate is nullable and renders "بيانات غير كافية", never
 * `0%` (DEC-B04 / API-X07).
 */
export function GroupPerformanceSection({
  groupId,
  onStudentPress,
  testID = 'group-performance',
  className,
  style,
}: GroupPerformanceSectionProps) {
  const [period, setPeriod] = useState<PerformancePeriod>('week');
  const { data, isLoading, isError, error, refetch } = useGroupPerformance(
    groupId,
    period,
  );

  const showSkeleton = isLoading && !data;
  const showError = isError && !data;

  return (
    <View
      testID={testID}
      className={`w-full gap-3.5 ${className ?? ''}`}
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
          variant="groupPerformance"
          testID={`${testID}-skeleton`}
        />
      ) : showError ? (
        <Banner
          tone="error"
          message={describeError(error)}
          onRetry={() => void refetch()}
          testID={`${testID}-error`}
        />
      ) : data ? (
        <GroupPerformanceContent
          data={data}
          period={period}
          onStudentPress={onStudentPress}
          testID={testID}
        />
      ) : null}
    </View>
  );
}

function GroupPerformanceContent({
  data,
  period,
  onStudentPress,
  testID,
}: {
  data: GroupPerformanceDto;
  period: PerformancePeriod;
  onStudentPress?: (student: GroupStudentPerformanceDto) => void;
  testID: string;
}) {
  return (
    <>
      <View className={`${rowStart} items-start gap-2.5 w-full`}>
        <MetricTile
          label="نسبة الإرسال"
          value={formatRate(data.submission_rate)}
          caption={PERIOD_CAPTION[period]}
          testID={`${testID}-submission`}
        />
        <MetricTile
          label="متوسط الالتزام"
          value={formatRate(data.commitment_average)}
          caption={formatArabicCount(data.students.length, STUDENT_COUNT_FORMS)}
          testID={`${testID}-average`}
        />
      </View>

      <View
        testID={`${testID}-absences`}
        className={`p-[18px] gap-3.5 ${itemsStart} ${CARD}`}
        style={{ borderCurve: 'continuous' }}
      >
        <Text
          className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
          accessibilityRole="header"
        >
          أسباب الغياب
        </Text>
        <Donut
          segments={toAbsenceSegments(data.absence_breakdown)}
          testID={`${testID}-donut`}
        />
      </View>

      <View
        className={`${rowStart} items-center justify-between pt-1.5 w-full`}
      >
        <Text
          className={`${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        >
          الطلاب
        </Text>
        <Text
          testID={`${testID}-order`}
          className={`${typography.caption} text-right text-fg-tertiary dark:text-fg-tertiary-dark`}
        >
          الأضعف أولًا
        </Text>
      </View>

      {data.students.length === 0 ? (
        <EmptyState
          icon="users"
          message={EMPTY_MESSAGE}
          testID={`${testID}-empty`}
        />
      ) : (
        <View className="w-full gap-2" testID={`${testID}-students`}>
          {data.students.map((student) => (
            <StudentRow
              key={student.membership_id}
              student={student}
              onPress={onStudentPress}
              testID={`${testID}-student-${student.membership_id}`}
            />
          ))}
        </View>
      )}
    </>
  );
}

function StudentRow({
  student,
  onPress,
  testID,
}: {
  student: GroupStudentPerformanceDto;
  onPress?: (student: GroupStudentPerformanceDto) => void;
  testID: string;
}) {
  const name = student.full_name || 'غير محدد';
  const score = formatRate(student.commitment_score);
  const pressable = Boolean(onPress);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${name}، نسبة الالتزام: ${
        score ?? METRIC_NULL_PLACEHOLDER
      }`}
      accessibilityState={{ disabled: !pressable }}
      disabled={!pressable}
      onPress={() => onPress?.(student)}
      className={`${rowStart} items-center gap-2.5 w-full rounded-md bg-surface dark:bg-surface-dark border border-line dark:border-line-dark px-3.5 py-3 active:opacity-80`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className="w-9 h-9 rounded-full bg-subtle dark:bg-subtle-dark items-center justify-center">
        <Text
          className={`${typography.labelMd} text-center text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.4}
        >
          {initialOf(student.full_name)}
        </Text>
      </View>

      <View className={`flex-1 gap-1 ${itemsStart}`}>
        <Text
          selectable
          numberOfLines={1}
          className={`w-full ${typography.bodyMdMedium} text-right text-fg dark:text-fg-dark`}
        >
          {name}
        </Text>
        {/* The at-risk badge and the "days since last report" line need the
            at-risk endpoint (API-040), which this feature does not call —
            the badge is a separate predicate and is never inferred from a
            low score (UF §17, UF §29). */}
      </View>

      <Text
        testID={`${testID}-score`}
        className={`${typography.headingSm} text-left ${
          score === null
            ? 'text-fg-tertiary dark:text-fg-tertiary-dark'
            : 'text-fg dark:text-fg-dark'
        }`}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={METRIC_MAX_FONT_SIZE_MULTIPLIER}
      >
        {score ?? '—'}
      </Text>

      {pressable ? (
        <Icon name="chevron-left" size={18} tone="tertiary" />
      ) : null}
    </Pressable>
  );
}
