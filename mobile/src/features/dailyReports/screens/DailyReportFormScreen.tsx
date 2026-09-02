import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { Button } from '@/shared/components/Button';
import { ConfirmationDialog } from '@/shared/components/ConfirmationDialog';
import { ApiError } from '@/shared/api/types';
import { DailyReportType } from '@/shared/api/dailyReports.client';
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

const TITLES: Record<DailyReportType, string> = {
  Normal: 'تقرير عادي',
  Revision: 'تقرير مراجعة',
  Absent: 'تقرير غياب',
};

/**
 * A non-field outcome of a submission (UF §15 submission-state table):
 * `retry` keeps the form (data preserved, UF §24); `home` discards it and
 * sends the student back for Home to re-evaluate fresh.
 */
interface Banner {
  message: string;
  action: 'retry' | 'home';
}

/**
 * SCR-10 Daily Report Form (F-DR-02, UF §15 / §28). Progressive disclosure
 * per type: Normal shows two independent gated sections (memorisation,
 * revision) plus the standalone tafsir toggle; Absent shows the reason only;
 * Revision shows range + time with no gate (BR-28a). Reachable from SCR-09
 * with the chosen type. No confirmation on submit (UF §25); a discard prompt
 * only when fields were touched.
 */
export function DailyReportFormScreen({ type }: DailyReportFormScreenProps) {
  const router = useRouter();
  const [reportDate] = useState(() => localTodayIsoDate());
  const [banner, setBanner] = useState<Banner | null>(null);
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
        // UF §15: routes to the Weekly Report; until SCR-12 exists, Home
        // offers "Complete Weekly Report" from the re-evaluated status.
        setBanner({ message: err.message, action: 'home' });
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
        <View className="w-full">
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
      );
    }

    return (
      <View className="w-full gap-2">
        {/* Section A — Memorization */}
        <View
          className="w-full p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
          style={{ borderCurve: 'continuous' }}
          testID="memo-section"
        >
          <Text
            className="text-base font-bold text-gray-900 dark:text-gray-100 text-right mb-3"
            accessibilityRole="header"
          >
            الحفظ
          </Text>
          <YesNoToggle
            question="هل حفظت آيات جديدة اليوم؟"
            value={values.memoGate === null ? null : values.memoGate === 'yes'}
            onChange={(yes) => set('memoGate', yes ? 'yes' : 'no')}
            disabled={isSubmitting}
            testID="memo-gate"
          />
          {values.memoGate === 'yes' ? (
            <View testID="memo-details">
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
                question="هل أتممت التكرارات الخمسين؟"
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
                  question="هل كانت التكرارات في جلسة واحدة؟"
                  value={values.repetitions_in_single_session}
                  onChange={(yes) => set('repetitions_in_single_session', yes)}
                  disabled={isSubmitting}
                  error={fieldError('repetitions_in_single_session')}
                  testID="single-session-toggle"
                />
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Section B — Revision */}
        <View
          className="w-full p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
          style={{ borderCurve: 'continuous' }}
          testID="rev-section"
        >
          <Text
            className="text-base font-bold text-gray-900 dark:text-gray-100 text-right mb-3"
            accessibilityRole="header"
          >
            المراجعة
          </Text>
          <YesNoToggle
            question="هل راجعت اليوم؟"
            value={values.revGate === null ? null : values.revGate === 'yes'}
            onChange={(yes) => set('revGate', yes ? 'yes' : 'no')}
            disabled={isSubmitting}
            testID="rev-gate"
          />
          {values.revGate === 'yes' ? (
            <View testID="rev-details">
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
        </View>

        {/* Standalone — tafsir (ISS-12: informational, feeds no metric) */}
        <View className="w-full px-1 pt-2" testID="tafsir-section">
          <YesNoToggle
            question="هل قرأت التفسير اليوم؟"
            note="للمتابعة فقط — لا يدخل في أي مؤشر"
            value={values.read_tafsir}
            onChange={(yes) => set('read_tafsir', yes)}
            disabled={isSubmitting}
            error={fieldError('read_tafsir')}
            testID="read-tafsir-toggle"
          />
        </View>
      </View>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, values, isSubmitting, errors, memoTimeError, revTimeError, set]);

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 20 }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      testID="daily-report-form-screen"
    >
      <View className="w-full max-w-md self-center gap-5">
        <View className="flex-row-reverse items-center justify-between">
          <View className="flex-1 gap-1">
            <Text
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
              accessibilityRole="header"
              testID="daily-report-form-title"
            >
              {TITLES[type]}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-right">
              تقرير اليوم يُرسل مرة واحدة ولا يمكن تعديله بعد الإرسال.
            </Text>
          </View>
          <Pressable
            testID="daily-report-form-cancel-button"
            accessibilityRole="button"
            accessibilityLabel="إلغاء والعودة"
            disabled={isSubmitting}
            onPress={requestClose}
            className="min-h-[48px] min-w-[48px] items-center justify-center rounded-full active:bg-gray-100 dark:active:bg-gray-800"
          >
            <Text className="text-xl font-bold text-gray-800 dark:text-gray-200">
              →
            </Text>
          </Pressable>
        </View>

        {banner ? (
          <View
            testID="daily-report-form-banner"
            accessibilityRole="alert"
            className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-4 gap-3"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row-reverse items-center gap-2">
              <Text accessibilityLabel="تنبيه" className="text-base">
                ⚠️
              </Text>
              <Text
                className="flex-1 text-destructive-800 dark:text-destructive-200 text-sm text-right leading-relaxed"
                testID="daily-report-form-banner-message"
              >
                {banner.message}
              </Text>
            </View>
            {banner.action === 'home' ? (
              <Button
                label="العودة إلى الرئيسية"
                variant="outline"
                onPress={goHome}
                testID="daily-report-form-home-button"
              />
            ) : null}
          </View>
        ) : null}

        {banner?.action === 'home' ? null : (
          <>
            {body}

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
      </View>

      <ConfirmationDialog
        visible={discardVisible}
        title="تجاهل هذا التقرير؟"
        message="لن يُحفظ ما أدخلته؛ يمكنك إرسال تقرير اليوم لاحقاً قبل منتصف الليل."
        confirmLabel="تجاهل"
        cancelLabel="متابعة الإدخال"
        onConfirm={() => {
          setDiscardVisible(false);
          goBack();
        }}
        onCancel={() => setDiscardVisible(false)}
        testID="discard-report-dialog"
      />
    </ScrollView>
  );
}
