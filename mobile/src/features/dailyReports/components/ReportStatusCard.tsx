import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { Banner } from '@/shared/components/Banner';
import { Button, ButtonVariant } from '@/shared/components/Button';
import { Icon, IconName, IconTone } from '@/shared/components/Icon';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import {
  DailyReportBlockReason,
  DailyReportDto,
} from '@/shared/api/dailyReports.client';
import { useTodayReportStatus } from '@/features/dailyReports/hooks/useTodayReportStatus';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { formatArabicDate } from '../utils/arabicDate';
import { localTodayIsoDate } from '../utils/dailyReportForm';

/**
 * The CTA's state as `GET /me/dashboard` reports it (API-009's
 * `can_submit_today` / `block_reason`) — the subset of API-029 the CTA
 * actually renders.
 */
export interface ReportStatusCardState {
  can_submit: boolean;
  block_reason?: DailyReportBlockReason;
}

export interface ReportStatusCardProps {
  /**
   * Controlled mode (F-DASH-03). When SCR-08 already holds the CTA state
   * from its one `GET /me/dashboard` call, it passes it here and the card
   * stops asking API-029 the same question — UF §10's "Every dashboard is
   * one `GET /me/dashboard` call".
   *
   * The one exception is `already_submitted`: APIS §10.3's Student payload
   * deliberately carries no `existing_report`, and "View Today's Report"
   * needs the report it opens. In that ONE state the card re-enables its own
   * API-029 read for that record — a datum the dashboard does not carry, not
   * a duplicate of one it does.
   *
   * Omit the prop and the card fetches its own state, as SCR-09's gate and
   * every other caller still expect.
   */
  status?: ReportStatusCardState;
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

/** Figma DailyCTA hero tones: primary (memorisation day), accent (recitation day), success (submitted). */
type HeroTone = 'primary' | 'accent' | 'success';

interface HeroState {
  kind: 'hero';
  tone: HeroTone;
  icon: IconName;
  title: string;
  description: string;
  cta: { label: string; testID: string; variant: ButtonVariant };
}

interface BannerState {
  kind: 'banner';
  message: string;
}

/**
 * UF §10 "Daily Report CTA state machine". The server states the reason
 * (API-029); this table only renders it — nothing is inferred client-side.
 */
const CTA_STATES: Record<
  DailyReportBlockReason | 'none',
  HeroState | BannerState
> = {
  none: {
    kind: 'hero',
    tone: 'primary',
    icon: 'pen',
    title: 'اليوم يوم حفظ',
    description: 'لم تُرسل تقرير اليوم بعد. يستغرق أقل من دقيقة.',
    cta: {
      label: 'إرسال تقرير اليوم',
      testID: 'submit-report-button',
      variant: 'secondary',
    },
  },
  already_submitted: {
    kind: 'hero',
    tone: 'success',
    icon: 'circle-check',
    title: 'تم إرسال تقرير اليوم',
    description: 'لا يمكن تعديل التقرير أو حذفه بعد إرساله.',
    cta: {
      label: 'عرض تقرير اليوم',
      testID: 'view-report-button',
      variant: 'primary',
    },
  },
  recitation_day: {
    kind: 'hero',
    tone: 'accent',
    icon: 'book',
    title: 'اليوم يوم التسميع',
    description: 'راجع ملخّص أسبوعك وأكّد حضورك لمجلس التسميع.',
    cta: {
      label: 'إكمال التقرير الأسبوعي',
      testID: 'weekly-report-button',
      variant: 'primary',
    },
  },
  group_archived: {
    kind: 'banner',
    message: 'مجموعتك لم تعد نشطة. لا يمكن إرسال التقارير حاليًا.',
  },
  membership_inactive: {
    kind: 'banner',
    message: 'عضويتك في الحلقة غير نشطة. لا يمكن إرسال التقارير حاليًا.',
  },
};

const HERO_TONES: Record<
  HeroTone,
  {
    container: string;
    pill: string;
    pillText: string;
    iconTone: IconTone;
    title: string;
    description: string;
  }
> = {
  primary: {
    container: 'bg-primary dark:bg-primary-dark',
    pill: 'bg-fg-on-primary/20',
    pillText: 'text-fg-on-primary',
    iconTone: 'on-primary',
    title: 'text-fg-on-primary',
    description: 'text-fg-on-primary opacity-80',
  },
  accent: {
    container:
      'bg-accent-subtle dark:bg-accent-subtle-dark border border-line-warning dark:border-line-warning-dark',
    pill: 'bg-surface dark:bg-surface-dark border border-line-warning dark:border-line-warning-dark',
    pillText: 'text-fg-accent dark:text-fg-accent-dark',
    iconTone: 'accent',
    title: 'text-fg dark:text-fg-dark',
    description: 'text-fg-secondary dark:text-fg-secondary-dark',
  },
  success: {
    container:
      'bg-success-subtle dark:bg-primary-subtle-dark border border-line-success',
    pill: 'bg-surface dark:bg-surface-dark border border-line-success',
    pillText: 'text-fg-success',
    iconTone: 'success',
    title: 'text-fg dark:text-fg-dark',
    description: 'text-fg-secondary dark:text-fg-secondary-dark',
  },
};

/**
 * SCR-08 DailyCTA hero (Figma 24:27 / 24:170) of Student Home (F-DR-01,
 * UF §10). Renders exactly the UF §10 state table from API-029's
 * `block_reason`: a day pill + glyph, a title, one line and a CTA for the
 * reachable states (submit / view / weekly), a warning Banner for
 * `group_archived` and `membership_inactive`. A CTA whose destination is
 * not wired yet renders disabled.
 */
export function ReportStatusCard({
  status,
  onSubmitReport,
  onViewReport,
  onCompleteWeeklyReport,
  testID = 'report-status-card',
  className,
  style,
}: ReportStatusCardProps) {
  const isControlled = status !== undefined;
  // Uncontrolled: the card owns the read. Controlled: it stays idle, except
  // in `already_submitted`, where only API-029 knows WHICH report to open.
  const query = useTodayReportStatus({
    enabled: !isControlled || status.block_reason === 'already_submitted',
  });
  const { isLoading, isError, error, refetch } = query;
  const data = isControlled ? status : query.data;

  if (!isControlled && isLoading && !data) {
    return (
      <View
        key="skeleton"
        testID={`${testID}-skeleton`}
        className={`w-full rounded-xl bg-subtle dark:bg-subtle-dark ${
          className ?? ''
        }`}
        style={[{ borderCurve: 'continuous' }, style]}
      >
        <SkeletonLoader variant="card" testID={`${testID}-skeleton-loader`} />
      </View>
    );
  }

  if (!isControlled && (isError || !data)) {
    return (
      <Banner
        key="error"
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID={`${testID}-error`}
        className={className}
        style={style}
      />
    );
  }

  if (!data) {
    return null;
  }

  const reason: DailyReportBlockReason | 'none' = data.can_submit
    ? 'none'
    : (data.block_reason ?? 'membership_inactive');
  const state = CTA_STATES[reason];

  if (state.kind === 'banner') {
    // UF §10: "No CTA — banner". Icon + text, never colour-only (UF §32).
    return (
      <Banner
        key="banner"
        tone="warning"
        icon="archive"
        message={state.message}
        testID={`${testID}-banner`}
        className={className}
        style={style}
      />
    );
  }

  // The report body always comes from API-029, controlled or not — the
  // dashboard payload has no `existing_report` (APIS §10.3). In controlled
  // mode the CTA is therefore inert only while that narrow read is in flight.
  const existingReport = query.data?.existing_report;
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
  const tone = HERO_TONES[state.tone];
  const dayLabel = formatArabicDate(
    existingReport?.report_date ?? localTodayIsoDate(),
  );

  return (
    <View
      key="data"
      testID={testID}
      accessibilityRole="summary"
      accessibilityLabel={`تقرير اليوم: ${dayLabel}. ${state.title}`}
      className={`w-full p-5 rounded-xl gap-3.5 ${itemsStart} ${tone.container} ${
        className ?? ''
      }`}
      style={[{ borderCurve: 'continuous' }, style]}
    >
      <View className={`w-full ${rowStart} items-center justify-between`}>
        <View
          testID={`${testID}-day-pill`}
          className={`rounded-full px-2.5 py-1 ${tone.pill}`}
          style={{ borderCurve: 'continuous' }}
        >
          <Text
            className={`${typography.labelSm} text-right ${tone.pillText}`}
            maxFontSizeMultiplier={1.4}
          >
            {dayLabel}
          </Text>
        </View>
        <Icon name={state.icon} size={26} tone={tone.iconTone} />
      </View>

      <Text
        className={`w-full ${typography.headingLg} text-right ${tone.title}`}
        testID={`${testID}-title`}
      >
        {state.title}
      </Text>

      <Text
        className={`w-full ${typography.bodyMd} text-right ${tone.description}`}
        testID={`${testID}-description`}
      >
        {state.description}
      </Text>

      <Button
        label={state.cta.label}
        variant={state.cta.variant}
        onPress={() => onPress?.()}
        disabled={!onPress}
        testID={state.cta.testID}
        className="w-full"
      />
    </View>
  );
}
