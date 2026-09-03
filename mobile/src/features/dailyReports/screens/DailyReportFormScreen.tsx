import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';
import { TopBar } from '@/shared/components/TopBar';
import { ApiError } from '@/shared/api/types';
import { DailyReportType } from '@/shared/api/dailyReports.client';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { useSubmitDailyReport } from '../hooks/useSubmitDailyReport';
import {
  buildSubmitPayload,
  DailyReportFormValues,
  EMPTY_FORM_VALUES,
  isFormComplete,
  localTodayIsoDate,
  SERVER_FIELD_TO_FORM_FIELD,
  timeWindowError,
} from '../utils/dailyReportForm';
import { formatArabicDate } from '../utils/arabicDate';
import { YesNoToggle } from '../components/YesNoToggle';
import { QuranRangeField } from '../components/QuranRangeField';
import { TimeWindowField } from '../components/TimeWindowField';
import { AbsenceReasonPicker } from '../components/AbsenceReasonPicker';

export interface DailyReportFormScreenProps {
  type: DailyReportType;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE =
  'حدث خطأ أثناء إرسال التقرير، يرجى المحاولة مرة أخرى';
const BACKDATED_MESSAGE =
  'انتهى اليوم ولم يعد بالإمكان إرسال هذا التقرير. ستُعاد تهيئة الشاشة الرئيسية.';
const FIELD_ERRORS_MESSAGE = 'يرجى تصحيح الأخطاء الموضحة في الحقول';
/** Figma SCR-10 · Normal: the immutability reminder above the submit CTA. */
const IMMUTABLE_NOTE = 'لا يمكن تعديل التقرير أو حذفه بعد الإرسال.';

/** One canonical term per report type (UF §33) — same as the SCR-09 cards. */
export const DAILY_REPORT_TITLES: Record<DailyReportType, string> = {
  Normal: 'تقرير عادي',
  Revision: 'مراجعة فقط',
  Absent: 'غياب',
};

/** Figma SCR-10 heading line per type. */
const SUBTITLES: Record<DailyReportType, string> = {
  Normal: 'يومُ حفظ. أجب عن سؤالي البوابة ثم املأ ما ينطبق.',
  Revision: 'يوم مراجعة. الحقول الأربعة مطلوبة.',
  Absent: 'اختر سببًا واحدًا. لا يُطلب أي تفصيل نصي.',
};

/**
 * A non-field outcome of a submission (UF §15 submission-state table):
 * `retry` keeps the form (data preserved, UF §24); `home` discards it and
 * sends the student back for Home to re-evaluate fresh.
 */
interface SubmissionBanner {
  message: string;
  action: 'retry' | 'home';
}

/** Figma form section card: surface, 1px border/default, radius lg, overline label. */
export function FormSection({
  label,
  testID,
  children,
}: {
  label: string;
  testID?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      className={`w-full px-4 py-5 gap-5 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
      style={{ borderCurve: 'continuous' }}
    >
      <Text
        className={`w-full ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
        accessibilityRole="header"
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

/**
 * SCR-10 Daily Report Form (F-DR-02, UF §15 / §28; Figma 26:414 / 26:546 /
 * 26:600). Progressive disclosure per type: Normal shows two independent
 * gated section cards (memorisation, revision) plus the standalone tafsir
 * card; Absent shows the reason picker only; Revision shows range + time
 * with no gate (BR-28a). Reachable from SCR-09 with the chosen type. No
 * confirmation on submit (UF §25); a light discard dialog (50:929) only
 * when fields were touched.
 */
export function DailyReportFormScreen({ type }: DailyReportFormScreenProps) {
  const router = useRouter();
  const [reportDate] = useState(() => localTodayIsoDate());
  const [banner, setBanner] = useState<SubmissionBanner | null>(null);
  const [discardVisible, setDiscardVisible] = useState(false);
  const submission = useSubmitDailyReport();

  const {
    watch,
    setValue,
    setError,
    clearErrors,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<DailyReportFormValues>({ defaultValues: EMPTY_FORM_VALUES });

  const values = watch();
  const isSubmitting = submission.isPending;
  const canSubmit = isFormComplete(type, values) && !isSubmitting;

  const set = useCallback(
    <K extends keyof DailyReportFormValues>(
      name: K,
      value: DailyReportFormValues[K],
    ) => {
      clearErrors(name);
      // Top-level keys only; RHF's path-typed overload cannot see through the
      // generic, hence the cast.
      setValue(name, value as never, { shouldDirty: true });
    },
    [clearErrors, setValue],
  );

  const goHome = useCallback(() => {
    router.replace('/(app)/student');
  }, [router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      goHome();
    }
  }, [router, goHome]);

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) {
      setDiscardVisible(true);
    } else {
      goBack();
    }
  };

  const onSubmit = handleSubmit(async (formValues) => {
    setBanner(null);
    try {
      await submission.mutateAsync(
        buildSubmitPayload(type, formValues, reportDate),
      );
      // Success and 409 alike (UF §36 "silent success"): Home re-reads
      // today's status through the invalidated query.
      goHome();
    } catch (err: unknown) {
      if (!(err instanceof ApiError)) {
        setBanner({ message: NETWORK_ERROR_MESSAGE, action: 'retry' });
        return;
      }
      if (err.statusCode >= 500) {
        setBanner({ message: SERVER_ERROR_MESSAGE, action: 'retry' });
        return;
      }
      if (err.statusCode === 422 && err.errorCode === 'BACKDATED') {
        setBanner({ message: BACKDATED_MESSAGE, action: 'home' });
        return;
      }
      if (err.statusCode === 422 && err.errorCode === 'RECITATION_DAY') {
        // UF §15: "Routes to Weekly Report, form discarded" — midnight
        // crossed mid-entry, so SCR-12 (F-WR-01) replaces the form.
        router.replace('/(app)/student/weekly-report');
        return;
      }
      if (err.statusCode === 422 && err.details && err.details.length > 0) {
        let attached = false;
        for (const detail of err.details) {
          const field = SERVER_FIELD_TO_FORM_FIELD[detail.field.split('.')[0]];
          if (field) {
            setError(field, { type: 'server', message: detail.message });
            attached = true;
          }
        }
        setBanner({
          message: attached ? FIELD_ERRORS_MESSAGE : err.message,
          action: 'retry',
        });
        return;
      }
      if (err.statusCode === 403) {
        setBanner({ message: err.message, action: 'home' });
        return;
      }
      setBanner({
        message: err.message || SERVER_ERROR_MESSAGE,
        action: 'retry',
      });
    }
  });

  const fieldError = (name: keyof DailyReportFormValues): string | undefined =>
    errors[name]?.message as string | undefined;

  const memoTimeError =
    fieldError('memo_time') ?? timeWindowError(values.memo_time);
  const revTimeError =
    fieldError('rev_time') ?? timeWindowError(values.rev_time);

  const body = useMemo(() => {
    if (type === 'Absent') {
      return (
        <AbsenceReasonPicker
          value={values.absence_reason}
          onChange={(reason) => set('absence_reason', reason)}
          disabled={isSubmitting}
          error={fieldError('absence_reason')}
          testID="absence-reason-picker"
        />
      );
    }

    if (type === 'Revision') {
      return (
        <FormSection label="المراجعة" testID="rev-section">
          <QuranRangeField
            label="نطاق المراجعة"
            rangeType="revision"
            value={values.rev_range}
            onChange={(range) => set('rev_range', range)}
            required
            disabled={isSubmitting}
            error={fieldError('rev_range')}
            testID="rev-range-field"
          />
          <TimeWindowField
            label="وقت المراجعة"
            value={values.rev_time}
            onChange={(window) => set('rev_time', window)}
            required
            disabled={isSubmitting}
            error={revTimeError}
            testID="rev-time-field"
          />
        </FormSection>
      );
    }

    return (
      <View className="w-full gap-6">
        {/* Section A — Memorization */}
        <FormSection label="الحفظ" testID="memo-section">
          <YesNoToggle
            question="هل حفظت آيات جديدة اليوم؟"
            value={values.memoGate === null ? null : values.memoGate === 'yes'}
            onChange={(yes) => set('memoGate', yes ? 'yes' : 'no')}
            disabled={isSubmitting}
            testID="memo-gate"
          />
          {values.memoGate === 'yes' ? (
            <View className="w-full gap-5" testID="memo-details">
              <QuranRangeField
                label="نطاق الحفظ"
                rangeType="memorization"
                value={values.memo_range}
                onChange={(range) => set('memo_range', range)}
                required
                disabled={isSubmitting}
                error={fieldError('memo_range')}
                testID="memo-range-field"
              />
              <TimeWindowField
                label="وقت الحفظ"
                value={values.memo_time}
                onChange={(window) => set('memo_time', window)}
                required
                disabled={isSubmitting}
                error={memoTimeError}
                testID="memo-time-field"
              />
              <YesNoToggle
                question="هل أتممت التكرار 50 مرة؟"
                value={values.completed_50_repetitions}
                onChange={(yes) => {
                  set('completed_50_repetitions', yes);
                  if (!yes) {
                    set('repetitions_in_single_session', null);
                  }
                }}
                disabled={isSubmitting}
                error={fieldError('completed_50_repetitions')}
                testID="completed-50-toggle"
              />
              {values.completed_50_repetitions === true ? (
                <YesNoToggle
                  question="في جلسة واحدة؟"
                  value={values.repetitions_in_single_session}
                  onChange={(yes) => set('repetitions_in_single_session', yes)}
                  disabled={isSubmitting}
                  error={fieldError('repetitions_in_single_session')}
                  testID="single-session-toggle"
                />
              ) : null}
            </View>
          ) : null}
        </FormSection>

        {/* Section B — Revision */}
        <FormSection label="المراجعة" testID="rev-section">
          <YesNoToggle
            question="هل راجعت اليوم؟"
            value={values.revGate === null ? null : values.revGate === 'yes'}
            onChange={(yes) => set('revGate', yes ? 'yes' : 'no')}
            disabled={isSubmitting}
            testID="rev-gate"
          />
          {values.revGate === 'yes' ? (
            <View className="w-full gap-5" testID="rev-details">
              <QuranRangeField
                label="نطاق المراجعة"
                rangeType="revision"
                value={values.rev_range}
                onChange={(range) => set('rev_range', range)}
                required
                disabled={isSubmitting}
                error={fieldError('rev_range')}
                testID="rev-range-field"
              />
              <TimeWindowField
                label="وقت المراجعة"
                value={values.rev_time}
                onChange={(window) => set('rev_time', window)}
                required
                disabled={isSubmitting}
                error={revTimeError}
                testID="rev-time-field"
              />
            </View>
          ) : null}
        </FormSection>

        {/* Standalone — tafsir (ISS-12: informational, feeds no metric) */}
        <FormSection label="التفسير" testID="tafsir-section">
          <YesNoToggle
            question="هل قرأت التفسير اليوم؟"
            value={values.read_tafsir}
            onChange={(yes) => set('read_tafsir', yes)}
            disabled={isSubmitting}
            error={fieldError('read_tafsir')}
            testID="read-tafsir-toggle"
          />
        </FormSection>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, values, isSubmitting, errors, memoTimeError, revTimeError, set]);

  const heading =
    type === 'Absent' ? 'سبب الغياب' : formatArabicDate(reportDate);

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="daily-report-form-screen"
    >
      <TopBar
        title={DAILY_REPORT_TITLES[type]}
        onBack={requestClose}
        testID="daily-report-form-top-bar"
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
      >
        <View className={`w-full gap-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
            testID="daily-report-form-title"
          >
            {heading}
          </Text>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="daily-report-form-subtitle"
          >
            {SUBTITLES[type]}
          </Text>
        </View>

        {banner ? (
          <View className="w-full gap-3">
            <Banner
              tone="error"
              icon={banner.action === 'home' ? 'alert' : undefined}
              message={banner.message}
              testID="daily-report-form-banner"
            />
            {banner.action === 'home' ? (
              <Button
                label="العودة إلى الرئيسية"
                variant="outline"
                onPress={goHome}
                testID="daily-report-form-home-button"
                className="w-full"
              />
            ) : null}
          </View>
        ) : null}

        {banner?.action === 'home' ? null : (
          <>
            {body}

            {type === 'Normal' ? (
              <Banner
                tone="info"
                message={IMMUTABLE_NOTE}
                testID="daily-report-form-immutable-note"
              />
            ) : (
              <View className="flex-1" />
            )}

            <Button
              label="إرسال التقرير"
              variant="primary"
              loading={isSubmitting}
              disabled={!canSubmit}
              onPress={() => void onSubmit()}
              testID="submit-report-button"
              className="w-full"
            />
          </>
        )}
      </ScrollView>

      <ConfirmationDialog
        visible={discardVisible}
        weight="light"
        title="تجاهل هذا التقرير؟"
        message="لا توجد مسودّات — ما أدخلته سيُفقد."
        confirmLabel="تجاهل"
        cancelLabel="إلغاء"
        onConfirm={() => {
          setDiscardVisible(false);
          goBack();
        }}
        onCancel={() => setDiscardVisible(false)}
        testID="discard-report-dialog"
      />
    </View>
  );
}
