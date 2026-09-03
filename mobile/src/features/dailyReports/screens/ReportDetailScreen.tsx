import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { YesNoToggle } from '../components/YesNoToggle';
import { QuranRangeField } from '../components/QuranRangeField';
import { TimeWindowField } from '../components/TimeWindowField';
import { AbsenceReasonPicker } from '../components/AbsenceReasonPicker';
import { TimeWindowDraft } from '../utils/dailyReportForm';

export interface ReportDetailScreenProps {
  /** The already-fetched row (F-DR-07: no endpoint of its own). */
  report: DailyReportDto;
  /**
   * Where "back" lands when there is no navigation history — the role's
   * Home. Student by default; the Teacher's SCR-25 → SCR-15 route passes
   * its own (UF §28: SCR-15 is Student / Teacher / Admin, scoped).
   */
  homeHref?: Href;
}

/** Same titles as SCR-10 (UF §33: one canonical term per concept). */
const TITLES: Record<DailyReportDto['type'], string> = {
  Normal: 'تقرير عادي',
  Revision: 'تقرير مراجعة',
  Absent: 'تقرير غياب',
};

const EMPTY_WINDOW: TimeWindowDraft = { from: null, to: null };

function toWindow(window: DailyReportDto['memo_time']): TimeWindowDraft {
  return window ? { from: window.from, to: window.to } : EMPTY_WINDOW;
}

const noop = () => {};

/**
 * SCR-15 Report Detail (F-DR-07, UF §15 / §28): "Same layout as
 * submission form, all fields disabled". Rendered purely from the row the
 * tapping list already holds — this screen owns no query and makes no
 * request. It reuses SCR-10's field components in their disabled state
 * with the report's values, keeping the two screens visually identical
 * without duplicating the form's layout logic. There is no submit, no
 * discard prompt and no editing path (BR-22: reports are immutable).
 */
export function ReportDetailScreen({
  report,
  homeHref = '/(app)/student',
}: ReportDetailScreenProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homeHref);
    }
  };

  const hasMemo = report.memo_range !== null;
  const hasRev = report.rev_range !== null;

  let body: React.ReactElement;
  if (report.type === 'Absent') {
    body = (
      <AbsenceReasonPicker
        value={report.absence_reason}
        onChange={noop}
        disabled
        testID="absence-reason-picker"
      />
    );
  } else if (report.type === 'Revision') {
    body = (
      <View className="w-full">
        <QuranRangeField
          label="نطاق المراجعة"
          rangeType="revision"
          value={report.rev_range}
          onChange={noop}
          disabled
          testID="rev-range-field"
        />
        <TimeWindowField
          label="وقت المراجعة"
          value={toWindow(report.rev_time)}
          onChange={noop}
          disabled
          testID="rev-time-field"
        />
      </View>
    );
  } else {
    body = (
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
            value={hasMemo}
            onChange={noop}
            disabled
            testID="memo-gate"
          />
          {hasMemo ? (
            <View testID="memo-details">
              <QuranRangeField
                label="نطاق الحفظ"
                rangeType="memorization"
                value={report.memo_range}
                onChange={noop}
                disabled
                testID="memo-range-field"
              />
              <TimeWindowField
                label="وقت الحفظ"
                value={toWindow(report.memo_time)}
                onChange={noop}
                disabled
                testID="memo-time-field"
              />
              <YesNoToggle
                question="هل أتممت التكرارات الخمسين؟"
                value={report.completed_50_repetitions}
                onChange={noop}
                disabled
                testID="completed-50-toggle"
              />
              {report.completed_50_repetitions === true ? (
                <YesNoToggle
                  question="هل كانت التكرارات في جلسة واحدة؟"
                  value={report.repetitions_in_single_session}
                  onChange={noop}
                  disabled
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
            value={hasRev}
            onChange={noop}
            disabled
            testID="rev-gate"
          />
          {hasRev ? (
            <View testID="rev-details">
              <QuranRangeField
                label="نطاق المراجعة"
                rangeType="revision"
                value={report.rev_range}
                onChange={noop}
                disabled
                testID="rev-range-field"
              />
              <TimeWindowField
                label="وقت المراجعة"
                value={toWindow(report.rev_time)}
                onChange={noop}
                disabled
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
            value={report.read_tafsir}
            onChange={noop}
            disabled
            testID="read-tafsir-toggle"
          />
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 20 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="report-detail-screen"
    >
      <View className="w-full max-w-md self-center gap-5">
        <View className="flex-row-reverse items-center justify-between">
          <View className="flex-1 gap-1">
            <Text
              className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
              accessibilityRole="header"
              testID="report-detail-title"
            >
              {TITLES[report.type]}
            </Text>
            <Text
              className="text-sm text-gray-500 dark:text-gray-400 text-right"
              style={{ fontVariant: ['tabular-nums'] }}
              testID="report-detail-date"
            >
              {`تقرير يوم ${report.report_date}`}
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 text-right">
              لا يمكن تعديل التقرير بعد إرساله.
            </Text>
          </View>
          <Pressable
            testID="report-detail-back-button"
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

        {body}
      </View>
    </ScrollView>
  );
}
