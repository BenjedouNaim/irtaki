import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { Button } from '@/shared/components/Button';
import { ApiError } from '@/shared/api/types';
import {
  DailyReportBlockReason,
  DailyReportDto,
} from '@/shared/api/dailyReports.client';
import { useTodayReportStatus } from '@/features/dailyReports/hooks/useTodayReportStatus';

export interface ReportStatusCardProps {
  /** `block_reason` absent → "Submit Today's Report" → opens SCR-09. */
  onSubmitReport?: () => void;
  /**
   * `already_submitted` → "View Today's Report" → today's report, read-only
   * (SCR-15), rendered from the `existing_report` API-029 already returned
   * (F-DR-07: no second request).
   */
  onViewReport?: (report: DailyReportDto) => void;
  /** `recitation_day` → "Complete Weekly Report" → Weekly Report (SCR-12). */
  onCompleteWeeklyReport?: () => void;
  testID?: string;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل حالة تقرير اليوم';

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table.
 * `5xx` and network failures → generic retry copy; any remaining `4xx`
 * carries the exception filter's Arabic message, shown verbatim.
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

interface CtaState {
  badge: { label: string; variant: StatusBadgeVariant };
  title: string;
  description: string;
  cta: { label: string; testID: string } | null;
}

/**
 * UF §10 "Daily Report CTA state machine". The server states the reason
 * (API-029); this table only renders it — nothing is inferred client-side.
 */
const CTA_STATES: Record<DailyReportBlockReason | 'none', CtaState> = {
  none: {
    badge: { label: 'يوم حفظ', variant: 'info' },
    title: 'لم يُرسل تقرير اليوم بعد',
    description: 'يُغلق باب الإرسال عند منتصف الليل، ولا يمكن إرساله لاحقاً.',
    cta: { label: 'إرسال تقرير اليوم', testID: 'submit-report-button' },
  },
  already_submitted: {
    badge: { label: 'تم الإرسال', variant: 'success' },
    title: 'تم إرسال تقرير اليوم',
    description: 'لا يمكن تعديل التقرير أو حذفه بعد إرساله.',
    cta: { label: 'عرض تقرير اليوم', testID: 'view-report-button' },
  },
  recitation_day: {
    badge: { label: 'يوم التسميع', variant: 'info' },
    title: 'اليوم هو يوم التسميع',
    description: 'لا يُرسل تقرير يومي في يوم التسميع؛ أكمل التقرير الأسبوعي.',
    cta: { label: 'إكمال التقرير الأسبوعي', testID: 'weekly-report-button' },
  },
  group_archived: {
    badge: { label: 'الحلقة مؤرشفة', variant: 'neutral' },
    title: 'حلقتك لم تعد نشطة',
    description: 'أُرشفت الحلقة؛ لا يمكن إرسال تقارير جديدة.',
    cta: null,
  },
  membership_inactive: {
    badge: { label: 'العضوية غير نشطة', variant: 'neutral' },
    title: 'عضويتك في الحلقة غير نشطة',
    description: 'لا يمكن إرسال تقارير دون عضوية نشطة.',
    cta: null,
  },
};

/**
 * Standalone Daily Report status / CTA card of SCR-08 (F-DR-01, UF §10).
 *
 * Renders exactly the UF §10 state table from API-029's `block_reason`:
 * a CTA for the reachable states (submit / view / weekly) and a no-CTA
 * banner for `group_archived` and `membership_inactive`. The full SCR-08
 * (weekly strip, score, payment chip) is assembled by EPIC-10 around this
 * component. A CTA whose destination is not wired yet renders disabled.
 */
export function ReportStatusCard({
  onSubmitReport,
  onViewReport,
  onCompleteWeeklyReport,
  testID = 'report-status-card',
  className,
  style,
}: ReportStatusCardProps) {
  const { data, isLoading, isError, error, refetch } = useTodayReportStatus();

  if (isLoading && !data) {
    return (
      <View
        key="skeleton"
        testID={`${testID}-skeleton`}
        className={`w-full bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <SkeletonLoader variant="card" testID={`${testID}-skeleton-loader`} />
      </View>
    );
  }

  if (isError || !data) {
    const message = describeError(error);

    return (
      <View
        key="error"
        testID={`${testID}-error`}
        accessibilityRole="alert"
        className={`w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-5 gap-3 ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <View className="flex-row items-center justify-center gap-2">
          <Text
            testID={`${testID}-error-icon`}
            accessibilityLabel="تنبيه"
            className="text-base"
          >
            ⚠️
          </Text>
          <Text className="text-destructive-800 dark:text-destructive-200 text-base font-semibold text-center">
            خطأ في تحميل البيانات
          </Text>
        </View>
        <Text
          className="text-destructive-700 dark:text-destructive-300 text-sm text-center leading-relaxed"
          testID={`${testID}-error-message`}
        >
          {message}
        </Text>
        <Button
          label="إعادة المحاولة"
          variant="outline"
          onPress={() => void refetch()}
          testID={`${testID}-retry-button`}
        />
      </View>
    );
  }

  const reason: DailyReportBlockReason | 'none' = data.can_submit
    ? 'none'
    : (data.block_reason ?? 'membership_inactive');
  const state = CTA_STATES[reason];

  const existingReport = data.existing_report;
  const handlers: Record<
    DailyReportBlockReason | 'none',
    (() => void) | undefined
  > = {
    none: onSubmitReport,
    already_submitted:
      onViewReport && existingReport
        ? () => onViewReport(existingReport)
        : undefined,
    recitation_day: onCompleteWeeklyReport,
    group_archived: undefined,
    membership_inactive: undefined,
  };
  const onPress = handlers[reason];

  if (!state.cta) {
    // UF §10: "No CTA — banner". Icon + text, never colour-only (UF §32).
    return (
      <View
        testID={`${testID}-banner`}
        accessibilityRole="alert"
        className={`w-full p-5 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 gap-2 ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <View className="flex-row items-center justify-end gap-2">
          <Text
            className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right"
            testID={`${testID}-title`}
          >
            {state.title}
          </Text>
          <Text
            testID={`${testID}-banner-icon`}
            accessibilityLabel="تنبيه"
            className="text-base"
          >
            ⚠️
          </Text>
        </View>
        <Text
          className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed"
          testID={`${testID}-description`}
        >
          {state.description}
        </Text>
      </View>
    );
  }

  return (
    <View
      key="data"
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`تقرير اليوم: ${state.badge.label}. ${state.title}`}
      className={`w-full p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm gap-3 ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className="flex-row items-center justify-between">
        <StatusBadge
          status={state.badge.label}
          variant={state.badge.variant}
          testID={`${testID}-badge`}
        />
      </View>

      <Text
        className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right"
        testID={`${testID}-title`}
      >
        {state.title}
      </Text>

      <Text
        className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed"
        testID={`${testID}-description`}
      >
        {state.description}
      </Text>

      <Button
        label={state.cta.label}
        variant="primary"
        onPress={() => onPress?.()}
        disabled={!onPress}
        testID={state.cta.testID}
        className="w-full mt-1"
      />
    </View>
  );
}
