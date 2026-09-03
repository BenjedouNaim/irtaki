import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { MetricRow } from '@/shared/components/MetricRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  StatusBadge,
  StatusBadgeVariant,
} from '@/shared/components/StatusBadge';
import { ApiError } from '@/shared/api/types';
import {
  WeeklyReportLiveDto,
  WeeklyReportState,
} from '@/shared/api/weeklyReports.client';
import { YesNoToggle } from '@/features/dailyReports/components/YesNoToggle';
import { useCurrentWeeklyReport } from '../hooks/useCurrentWeeklyReport';
import { useConfirmWeeklyReport } from '../hooks/useConfirmWeeklyReport';

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

/**
 * A non-field outcome of a confirmation (UF §16 state table): `retry`
 * keeps the screen and the answer (UF §24 "form data always preserved");
 * `home` sends the student back for Home to re-evaluate fresh.
 */
interface Banner {
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

const STATE_BADGE: Record<
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
const MISSED_METRICS: ReadonlyArray<{
  key: keyof Pick<
    WeeklyReportLiveDto,
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

/**
 * SCR-12 Weekly Report (F-WR-01, UF §16 / §28): "Vertical stack: header,
 * metrics, checkbox, CTA". Reached from the SCR-08 CTA on the recitation
 * day (UF §26) and from the SCR-10 `422 RECITATION_DAY` path (UF §15).
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
  const [banner, setBanner] = useState<Banner | null>(null);
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

  const header = (
    <View className="flex-row-reverse items-center justify-between">
      <View className="flex-1 gap-1">
        <Text
          className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
          accessibilityRole="header"
          testID="weekly-report-title"
        >
          التقرير الأسبوعي
        </Text>
        {data ? (
          <Text
            className="text-sm text-gray-500 dark:text-gray-400 text-right"
            testID="weekly-report-week-range"
          >
            {`من ${data.week_start} إلى ${data.week_end}`}
          </Text>
        ) : null}
      </View>
      <Pressable
        testID="weekly-report-back-button"
        accessibilityRole="button"
        accessibilityLabel="العودة"
        onPress={goBack}
        className="min-h-[48px] min-w-[48px] items-center justify-center rounded-full active:bg-gray-100 dark:active:bg-gray-800"
      >
        <Text className="text-xl font-bold text-gray-800 dark:text-gray-200">
          →
        </Text>
      </Pressable>
    </View>
  );

  let body: React.ReactElement;

  if (isLoading && !data) {
    // UF §22: skeleton matching the eventual layout — six metric rows.
    body = (
      <View testID="weekly-report-skeleton">
        <SkeletonLoader
          variant="metricRow"
          count={6}
          testID="weekly-report-skeleton-loader"
        />
      </View>
    );
  } else if (isError || !data) {
    body = (
      <View
        testID="weekly-report-error"
        accessibilityRole="alert"
        className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-5 gap-3"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row-reverse items-center gap-2">
          <Text
            testID="weekly-report-error-icon"
            accessibilityLabel="تنبيه"
            className="text-base"
          >
            ⚠️
          </Text>
          <Text
            className="flex-1 text-destructive-800 dark:text-destructive-200 text-sm text-right leading-relaxed"
            testID="weekly-report-error-message"
          >
            {describeError(error)}
          </Text>
        </View>
        <Button
          label="إعادة المحاولة"
          variant="outline"
          onPress={() => void refetch()}
          testID="weekly-report-retry-button"
        />
      </View>
    );
  } else {
    const badge = STATE_BADGE[data.state];
    const canConfirm = data.can_confirm && data.id !== null;
    const reportId = data.id;

    body = (
      <View className="w-full gap-4" testID="weekly-report-content">
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
            value={data.expected_days}
            hint="أيام الحفظ المحتسبة هذا الأسبوع (بحد أقصى 6)"
            testID="metric-expected-days"
          />
          {MISSED_METRICS.map(({ key, label }) => (
            <MetricRow
              key={key}
              label={label}
              value={data[key]}
              testID={`metric-${key.replace(/_/g, '-')}`}
            />
          ))}
        </View>

        {canConfirm && reportId !== null ? (
          <View className="w-full gap-2" testID="weekly-report-confirm-section">
            <YesNoToggle
              question="هل حضرت جلسة التسميع؟"
              value={attended}
              onChange={setAttended}
              disabled={confirming}
              testID="attended-toggle"
            />
            {banner ? (
              <View
                testID="weekly-report-confirm-banner"
                accessibilityRole="alert"
                className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-4 gap-3"
                style={{ borderCurve: 'continuous' }}
              >
                <View className="flex-row-reverse items-center gap-2">
                  <Text
                    testID="weekly-report-confirm-banner-icon"
                    accessibilityLabel="تنبيه"
                    className="text-base"
                  >
                    ⚠️
                  </Text>
                  <Text
                    className="flex-1 text-destructive-800 dark:text-destructive-200 text-sm text-right leading-relaxed"
                    testID="weekly-report-confirm-banner-message"
                  >
                    {banner.message}
                  </Text>
                </View>
                {banner.action === 'home' ? (
                  <Button
                    label="العودة إلى الرئيسية"
                    variant="outline"
                    onPress={goHome}
                    testID="weekly-report-confirm-banner-home-button"
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
        ) : data.state === 'Finalised' ? (
          <View
            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 gap-1"
            style={{ borderCurve: 'continuous' }}
            testID="weekly-report-finalised-note"
          >
            <Text className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-right">
              تم اعتماد هذا التقرير ولا يمكن تعديله.
            </Text>
            <Text
              className="text-sm text-gray-600 dark:text-gray-400 text-right"
              testID="weekly-report-attended-line"
            >
              {`حضور جلسة التسميع: ${
                data.attended_recitation_call ? 'نعم' : 'لا'
              }`}
            </Text>
            {alreadyFinalised ? (
              <Text
                className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed"
                testID="weekly-report-already-finalised-note"
              >
                اعتُمد هذا الأسبوع تلقائياً عند منتصف الليل قبل تأكيدك.
              </Text>
            ) : null}
          </View>
        ) : (
          <View
            className="w-full p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
            style={{ borderCurve: 'continuous' }}
            testID="weekly-report-live-note"
          >
            <Text className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed">
              هذه أرقام الأسبوع الجاري وتتحدث مع كل تقرير يومي. يُتاح تأكيد
              التقرير في يوم التسميع فقط.
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 20 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="weekly-report-screen"
    >
      <View className="w-full max-w-md self-center gap-5">
        {header}
        {body}
      </View>
    </ScrollView>
  );
}
