import React from 'react';
import { View, Text } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { SkeletonRow } from '@/shared/components/SkeletonRow';
import { WeeklyStrip } from '@/shared/components/WeeklyStrip';
import { ApiError } from '@/shared/api/types';
import { useCurrentWeeklyReport } from '@/features/weeklyReports/hooks/useCurrentWeeklyReport';
import {
  buildWeekStrip,
  reportedDaysSoFar,
} from '@/features/weeklyReports/utils/weekStrip';
import { localTodayIsoDate } from '@/features/dailyReports/utils/dailyReportForm';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';

export interface WeekCardProps {
  testID?: string;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل بيانات الأسبوع';

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
 * SCR-08 "هذا الأسبوع" card (Figma 24:38; UF §10 "This-week live card",
 * UF §15 "Weekly schedule context"): head row (title + "4 من 6 أيام") and
 * the 7-cell WeeklyStrip, read-only, driven by API-033 (F-WR-01). Two
 * SkeletonRows stand in on first load (Figma 50:1072); a `404` — no active
 * membership — hides the card, since the Daily CTA already says why.
 */
export function WeekCard({ testID = 'week-card' }: WeekCardProps) {
  const { data, isLoading, isError, error, refetch } = useCurrentWeeklyReport();

  if (isLoading && !data) {
    return (
      <View testID={`${testID}-skeleton`} className="w-full gap-4">
        <SkeletonRow testID={`${testID}-skeleton-row-0`} />
        <SkeletonRow testID={`${testID}-skeleton-row-1`} />
      </View>
    );
  }

  if (isError || !data) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return null;
    }
    return (
      <Banner
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID={`${testID}-error`}
      />
    );
  }

  const days = buildWeekStrip(data, localTodayIsoDate());
  const reported = reportedDaysSoFar(data);

  return (
    <View
      testID={testID}
      className={`w-full p-5 gap-3.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
      style={{ borderCurve: 'continuous' }}
    >
      <View className={`w-full ${rowStart} items-center justify-between`}>
        <Text
          className={`${typography.headingSm} text-right text-fg dark:text-fg-dark`}
          accessibilityRole="header"
        >
          هذا الأسبوع
        </Text>
        <Text
          testID={`${testID}-count`}
          className={`${typography.labelSm} text-fg-secondary dark:text-fg-secondary-dark`}
          maxFontSizeMultiplier={1.5}
        >
          {`${reported} من ${data.expected_days} أيام`}
        </Text>
      </View>
      <WeeklyStrip days={days} testID={`${testID}-strip`} />
    </View>
  );
}
