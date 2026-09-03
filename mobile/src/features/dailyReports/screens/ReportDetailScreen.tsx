import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { MetricRow } from '@/shared/components/MetricRow';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TopBar } from '@/shared/components/TopBar';
import {
  AyahRangeDto,
  DailyReportDto,
  TimeWindowDto,
} from '@/shared/api/dailyReports.client';
import { useSurahs } from '@/features/progress/hooks/useSurahs';
import {
  buildSurahIndex,
  formatAyahRange,
} from '@/features/progress/utils/ayahRange';
import { typography } from '@/shared/theme/typography';
import { itemsStart, rowStart } from '@/shared/theme/rtl';
import {
  ABSENCE_REASON_LABELS,
  OTHER_REASON_NOTE,
} from '../components/AbsenceReasonPicker';
import { dailyReportBadge } from '../components/DailyReportRow';
import {
  formatArabicDate,
  formatLocalTime,
  formatTimeWindow,
} from '../utils/arabicDate';

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

/** Figma SCR-15: the immutability reminder under the head row. */
const FINAL_NOTE = 'التقارير المرسلة نهائية — لا تعديل ولا حذف.';

const YES = 'نعم';
const NO = 'لا';
const UNANSWERED = '—';

function yesNo(value: boolean | null): string {
  if (value === null) return UNANSWERED;
  return value ? YES : NO;
}

function timeWindow(value: TimeWindowDto | null): string {
  return value ? formatTimeWindow(value.from, value.to) : UNANSWERED;
}

/** Figma SCR-15 section card: surface, 1px border/default, radius lg, overline + 44px rows. */
function DetailSection({
  label,
  testID,
  children,
}: {
  label: string;
  testID: string;
  children: React.ReactNode;
}) {
  return (
    <View
      testID={testID}
      className={`w-full px-4 py-3 gap-1 rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark ${itemsStart}`}
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
 * SCR-15 Report Detail (F-DR-07, UF §15 / §28; Figma 31:981): TopBar
 * "تقرير الثلاثاء 2 سبتمبر", head row (type badge + submission time), the
 * immutability Banner, then one section card per SCR-10 section with a
 * read-only MetricRow per field. Rendered purely from the row the tapping
 * list already holds — this screen owns no query and makes no request
 * (the surah reference data is the cached `useSurahs` list). There is no
 * submit, no discard prompt and no editing path (BR-22: reports are
 * immutable).
 */
export function ReportDetailScreen({
  report,
  homeHref = '/(app)/student',
}: ReportDetailScreenProps) {
  const router = useRouter();
  const { data: surahs } = useSurahs();
  const surahIndex = useMemo(() => buildSurahIndex(surahs ?? []), [surahs]);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homeHref);
    }
  };

  const range = (value: AyahRangeDto | null): string =>
    value ? formatAyahRange(surahIndex, value, { collapse: true }) : UNANSWERED;

  const badge = dailyReportBadge(report);
  const hasMemo = report.memo_range !== null;
  const hasRev = report.rev_range !== null;

  let body: React.ReactElement;
  if (report.type === 'Absent') {
    const reason = report.absence_reason;
    body = (
      <DetailSection label="الغياب" testID="absence-section">
        <MetricRow
          label="السبب"
          value={reason ? ABSENCE_REASON_LABELS[reason] : UNANSWERED}
          hint={reason === 'Other' ? OTHER_REASON_NOTE : undefined}
          testID="report-detail-absence-reason"
        />
      </DetailSection>
    );
  } else if (report.type === 'Revision') {
    body = (
      <DetailSection label="المراجعة" testID="rev-section">
        <MetricRow
          label="النطاق"
          value={range(report.rev_range)}
          testID="report-detail-rev-range"
        />
        <MetricRow
          label="الوقت"
          value={timeWindow(report.rev_time)}
          testID="report-detail-rev-time"
        />
      </DetailSection>
    );
  } else {
    body = (
      <>
        {/* Section A — Memorization */}
        <DetailSection label="الحفظ" testID="memo-section">
          <MetricRow
            label="حفظت آيات جديدة"
            value={hasMemo ? YES : NO}
            testID="report-detail-memo-gate"
          />
          {hasMemo ? (
            <View className="w-full gap-1" testID="memo-details">
              <MetricRow
                label="النطاق"
                value={range(report.memo_range)}
                testID="report-detail-memo-range"
              />
              <MetricRow
                label="الوقت"
                value={timeWindow(report.memo_time)}
                testID="report-detail-memo-time"
              />
              <MetricRow
                label="التكرار 50 مرة"
                value={yesNo(report.completed_50_repetitions)}
                testID="report-detail-completed-50"
              />
              {report.completed_50_repetitions === true ? (
                <MetricRow
                  label="في جلسة واحدة"
                  value={yesNo(report.repetitions_in_single_session)}
                  testID="report-detail-single-session"
                />
              ) : null}
            </View>
          ) : null}
        </DetailSection>

        {/* Section B — Revision */}
        <DetailSection label="المراجعة" testID="rev-section">
          <MetricRow
            label="راجعت اليوم"
            value={hasRev ? YES : NO}
            testID="report-detail-rev-gate"
          />
          {hasRev ? (
            <View className="w-full gap-1" testID="rev-details">
              <MetricRow
                label="النطاق"
                value={range(report.rev_range)}
                testID="report-detail-rev-range"
              />
              <MetricRow
                label="الوقت"
                value={timeWindow(report.rev_time)}
                testID="report-detail-rev-time"
              />
            </View>
          ) : null}
        </DetailSection>

        {/* Standalone — tafsir (ISS-12: informational, feeds no metric) */}
        <DetailSection label="التفسير" testID="tafsir-section">
          <MetricRow
            label="قرأت التفسير"
            value={yesNo(report.read_tafsir)}
            testID="report-detail-read-tafsir"
          />
        </DetailSection>
      </>
    );
  }

  const submittedAt = formatLocalTime(report.submitted_at);

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="report-detail-screen"
    >
      <TopBar
        title={`تقرير ${formatArabicDate(report.report_date)}`}
        onBack={goBack}
        testID="report-detail"
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className={`w-full ${rowStart} items-center justify-between`}>
          <Text
            className={`${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="report-detail-date"
          >
            {submittedAt ? `أُرسل في ${submittedAt}` : report.report_date}
          </Text>
          <StatusBadge
            status={badge.label}
            variant={badge.variant}
            testID="report-detail-type"
          />
        </View>

        <Banner tone="info" message={FINAL_NOTE} testID="report-detail-note" />

        {body}
      </ScrollView>
    </View>
  );
}
