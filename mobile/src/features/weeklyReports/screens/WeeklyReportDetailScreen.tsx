import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { MetricRow } from '@/shared/components/MetricRow';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { TopBar } from '@/shared/components/TopBar';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import {
  formatArabicWeekRange,
  formatLocalDateTime,
} from '@/features/dailyReports/utils/arabicDate';
import { typography } from '@/shared/theme/typography';
import { rowStart } from '@/shared/theme/rtl';
import {
  finalisedBadge,
  WeeklyReportMetrics,
} from '../components/WeeklyReportMetrics';

export interface WeeklyReportDetailScreenProps {
  /** The already-fetched row (no endpoint of its own — UF §26 Detail). */
  report: WeeklyReportDto;
  /** Where "back" lands when there is no navigation history. */
  homeHref?: Href;
}

/** Figma 50:989: the auto-close reminder under the metrics. */
const AUTO_CLOSE_NOTE =
  "إن لم يُؤكَّد التقرير في يوم التسميع، يُغلق تلقائيًا في منتصف الليل بحالة 'لم يحضر'.";

/** "أُكِّد السبت 27 أوت 20:05" / "أُغلق تلقائيًا السبت 27 أوت 00:00". */
export function describeFinalisation(report: WeeklyReportDto): string {
  if (!report.finalised_at) return '';
  const when = formatLocalDateTime(report.finalised_at);
  return report.finalised_by === 'Scheduler'
    ? `أُغلق تلقائيًا ${when}`
    : `أُكِّد ${when}`;
}

/**
 * SCR-15 Report Detail, weekly variant (UF §26 "Weekly sub-tab → Detail
 * (read-only)", UF §28; Figma 50:989): TopBar titled with the week range,
 * a head row (finalisation badge + timestamp), the Metrics card with the
 * expected-days context row, the five metrics and the recorded attendance
 * as a read-only row, then the auto-close reminder Banner. Rendered from
 * the row the history list already holds — this screen owns no query and
 * makes no request; there is no confirm, no editing path (FR-WR-07: a
 * finalised weekly report is immutable).
 */
export function WeeklyReportDetailScreen({
  report,
  homeHref = '/(app)/student',
}: WeeklyReportDetailScreenProps) {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(homeHref);
    }
  };

  const badge = finalisedBadge(report.finalised_by);
  const finalisation = describeFinalisation(report);

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="weekly-report-detail-screen"
    >
      <TopBar
        title={formatArabicWeekRange(report.week_start, report.week_end)}
        onBack={goBack}
        testID="weekly-report-detail"
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
        testID="weekly-report-detail-content"
      >
        <View
          className={`w-full ${rowStart} items-center justify-between gap-3`}
        >
          <Text
            className={`flex-1 ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="weekly-report-detail-finalised-at"
          >
            {finalisation}
          </Text>
          <StatusBadge
            status={badge.label}
            variant={badge.variant}
            testID="weekly-report-detail-state-badge"
          />
        </View>

        <WeeklyReportMetrics report={report} showExpectedDays>
          <MetricRow
            label="حضور مجلس التسميع"
            value={report.attended_recitation_call ? 'نعم' : 'لا'}
            testID="metric-attended-recitation-call"
          />
        </WeeklyReportMetrics>

        <Banner
          tone="info"
          message={AUTO_CLOSE_NOTE}
          testID="weekly-report-detail-finalised-note"
        />
      </ScrollView>
    </View>
  );
}
