import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { MetricRow } from '@/shared/components/MetricRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TopBar } from '@/shared/components/TopBar';
import { ApiError } from '@/shared/api/types';
import { YesNoToggle } from '@/features/dailyReports/components/YesNoToggle';
import { formatArabicWeekRange } from '@/features/dailyReports/utils/arabicDate';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import { useCurrentWeeklyReport } from '../hooks/useCurrentWeeklyReport';
import { useConfirmWeeklyReport } from '../hooks/useConfirmWeeklyReport';
import {
  STATE_BADGE,
  WeeklyReportMetrics,
} from '../components/WeeklyReportMetrics';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل التقرير الأسبوعي';
/** Confirmation failed for a 5xx / network cause — generic retry copy (UF §24). */
const CONFIRM_SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تأكيد التقرير الأسبوعي';
/**
 * `422 NOT_RECITATION_DAY` — "Defensive only: generic error, returns to
 * Home" (UF §16). The screen is unreachable off the recitation day, so the
 * only way here is midnight crossing mid-entry; Home re-evaluates fresh.
 */
const NOT_RECITATION_DAY_MESSAGE =
  'تعذر تأكيد التقرير الأسبوعي؛ انتهى يوم التسميع.';
/** Figma SCR-12 heading line — "6 أيام متوقّعة. ملخّص صادق — لا يُخفَّف." */
const HONEST_SUMMARY = 'ملخّص صادق — لا يُخفَّف.';
const LIVE_NOTE =
  'هذه أرقام الأسبوع الجاري وتتحدث مع كل تقرير يومي. يُتاح تأكيد التقرير في يوم التسميع فقط.';
const FINALISED_NOTE = 'تم اعتماد هذا التقرير ولا يمكن تعديله.';
const ALREADY_FINALISED_NOTE =
  'اعتُمد هذا الأسبوع تلقائياً عند منتصف الليل قبل تأكيدك.';

/**
 * A non-field outcome of a confirmation (UF §16 state table): `retry`
 * keeps the screen and the answer (UF §24 "form data always preserved");
 * `home` sends the student back for Home to re-evaluate fresh.
 */
interface ConfirmBanner {
  message: string;
  action: 'retry' | 'home';
}

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

/**
 * SCR-12 Weekly Report (F-WR-01, UF §16 / §28; Figma 27:633): TopBar
 * "التقرير الأسبوعي", heading (week range + expected days line), the
 * Metrics card, the attendance card and the Confirm CTA. Reached from the
 * SCR-08 CTA on the recitation day (UF §26) and from the SCR-10
 * `422 RECITATION_DAY` path (UF §15).
 *
 * Everything shown comes from API-033; the screen infers nothing:
 *  - `can_confirm=true` (recitation day, `Open`): metrics + the attendance
 *    Yes/No gate with no default + Confirm, disabled until answered.
 *  - `state=Finalised`: the finalised result read-only with a quiet note,
 *    no error tone, never re-confirmable (UF §16, EC-24).
 *  - otherwise (`id=null`, before the recitation day): the live metrics
 *    read-only — the "this week" view — and a note that confirmation
 *    unlocks on the recitation day (UXQ-06).
 * A zero-activity week renders fully, every metric near its max (UF §16).
 *
 * Confirm (F-WR-02, API-034, UF §16 state table; no confirmation dialog,
 * UF §25): Submitting → spinner, gate locked; `200` → Home (metrics now
 * snapshotted, the week appears in History); `409 ALREADY_FINALISED` → the
 * finalised result read-only with a quiet note, no error tone (the
 * invalidated API-033 query re-reads the row); `422 NOT_RECITATION_DAY` →
 * generic error, returns to Home; `5xx`/network → generic retry copy, the
 * answer preserved (UF §24). Errors are icon + text (UF §32).
 */
export function WeeklyReportScreen() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useCurrentWeeklyReport();
  const confirmation = useConfirmWeeklyReport();
  const [attended, setAttended] = useState<boolean | null>(null);
  const [banner, setBanner] = useState<ConfirmBanner | null>(null);
  const [alreadyFinalised, setAlreadyFinalised] = useState(false);
  const confirming = confirmation.isPending;

  const goHome = () => {
    router.replace('/(app)/student');
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      goHome();
    }
  };

  const submitConfirmation = async (reportId: string, answer: boolean) => {
    setBanner(null);
    try {
      const outcome = await confirmation.mutateAsync({
        reportId,
        attended_recitation_call: answer,
      });
      if (outcome.kind === 'finalised') {
        // UF §16 Success: "Routes to Home, metrics now snapshotted".
        goHome();
        return;
      }
      // UF §16 409: scheduler beat the student — the invalidated query now
      // serves the finalised row; only a quiet note is added.
      setAlreadyFinalised(true);
    } catch (err: unknown) {
      if (!(err instanceof ApiError)) {
        setBanner({ message: NETWORK_ERROR_MESSAGE, action: 'retry' });
        return;
      }
      if (err.statusCode >= 500) {
        setBanner({ message: CONFIRM_SERVER_ERROR_MESSAGE, action: 'retry' });
        return;
      }
      if (err.statusCode === 422 && err.errorCode === 'NOT_RECITATION_DAY') {
        setBanner({ message: NOT_RECITATION_DAY_MESSAGE, action: 'home' });
        return;
      }
      if (err.statusCode === 403) {
        setBanner({ message: err.message, action: 'home' });
        return;
      }
      setBanner({
        message: err.message || CONFIRM_SERVER_ERROR_MESSAGE,
        action: 'retry',
      });
    }
  };

  let body: React.ReactElement;

  if (isLoading && !data) {
    // UF §22: skeleton matching the eventual layout — the five metric rows.
    body = (
      <View
        testID="weekly-report-skeleton"
        className="w-full px-4 py-3 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark"
        style={{ borderCurve: 'continuous' }}
      >
        <SkeletonLoader
          variant="metricRow"
          count={5}
          testID="weekly-report-skeleton-loader"
        />
      </View>
    );
  } else if (isError || !data) {
    body = (
      <Banner
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID="weekly-report-error"
      />
    );
  } else {
    const canConfirm = data.can_confirm && data.id !== null;
    const reportId = data.id;
    const finalised = data.state === 'Finalised';

    body = (
      <View className="w-full gap-5" testID="weekly-report-content">
        <View className={`w-full gap-1 ${itemsStart}`}>
          <View
            className={`w-full ${rowStart} items-center justify-between gap-3`}
          >
            <Text
              className={`flex-1 ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
              accessibilityRole="header"
              testID="weekly-report-week-range"
            >
              {formatArabicWeekRange(data.week_start, data.week_end)}
            </Text>
            {finalised ? (
              <StatusBadge
                status={STATE_BADGE.Finalised.label}
                variant={STATE_BADGE.Finalised.variant}
                testID="weekly-report-state-badge"
              />
            ) : null}
          </View>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="weekly-report-expected-days"
          >
            {`${data.expected_days} أيام متوقّعة. ${HONEST_SUMMARY}`}
          </Text>
        </View>

        <WeeklyReportMetrics report={data}>
          {finalised ? (
            <MetricRow
              label="حضور مجلس التسميع"
              value={data.attended_recitation_call ? 'نعم' : 'لا'}
              testID="weekly-report-attended-line"
            />
          ) : null}
        </WeeklyReportMetrics>

        {canConfirm && reportId !== null ? (
          <View className="w-full gap-4" testID="weekly-report-confirm-section">
            <View
              className={`w-full px-4 py-5 gap-2.5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
              style={{ borderCurve: 'continuous' }}
            >
              <YesNoToggle
                question="هل حضرت مجلس التسميع؟"
                value={attended}
                onChange={setAttended}
                disabled={confirming}
                testID="attended-toggle"
              />
            </View>
            {banner ? (
              <View className="w-full gap-3">
                <Banner
                  tone="error"
                  icon={banner.action === 'home' ? 'alert' : undefined}
                  message={banner.message}
                  testID="weekly-report-confirm-banner"
                />
                {banner.action === 'home' ? (
                  <Button
                    label="العودة إلى الرئيسية"
                    variant="outline"
                    onPress={goHome}
                    testID="weekly-report-confirm-banner-home-button"
                    className="w-full"
                  />
                ) : null}
              </View>
            ) : null}
            <Button
              label="تأكيد التقرير الأسبوعي"
              variant="primary"
              loading={confirming}
              disabled={attended === null || confirming}
              onPress={() => {
                if (attended !== null) {
                  void submitConfirmation(reportId, attended);
                }
              }}
              testID="confirm-weekly-report-button"
              className="w-full"
            />
          </View>
        ) : finalised ? (
          <View className="w-full gap-3">
            <Banner
              tone="info"
              message={FINALISED_NOTE}
              testID="weekly-report-finalised-note"
            />
            {alreadyFinalised ? (
              <Banner
                tone="info"
                message={ALREADY_FINALISED_NOTE}
                testID="weekly-report-already-finalised-note"
              />
            ) : null}
          </View>
        ) : (
          <Banner
            tone="info"
            message={LIVE_NOTE}
            testID="weekly-report-live-note"
          />
        )}
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="weekly-report-screen"
    >
      <TopBar title="التقرير الأسبوعي" onBack={goBack} testID="weekly-report" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {body}
      </ScrollView>
    </View>
  );
}
