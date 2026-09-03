import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { SegmentedControl } from '@/shared/components/SegmentedControl';
import { TopBar } from '@/shared/components/TopBar';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { WeeklyReportDto } from '@/shared/api/weeklyReports.client';
import { WeeklyReportHistoryList } from '@/features/weeklyReports/components/WeeklyReportHistoryList';
import { DailyReportHistoryList } from '../components/DailyReportHistoryList';

export type ReportHistoryTab = 'daily' | 'weekly';

export interface ReportHistoryScreenProps {
  /** Daily row tap → SCR-15 rendered from that row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
  /** Weekly row tap → the read-only weekly detail rendered from that row (F-WR-03). */
  onOpenWeeklyReport?: (report: WeeklyReportDto) => void;
  /** Sub-tab shown on open; the Daily sub-tab is the default (UF §15). */
  initialTab?: ReportHistoryTab;
}

/** UF §15: "[Daily Reports] · [Weekly Reports] (two sub-tabs)" — Figma segment labels. */
const TABS: Array<{ value: ReportHistoryTab; label: string }> = [
  { value: 'daily', label: 'اليومية' },
  { value: 'weekly', label: 'الأسبوعية' },
];

const TAB_CONTENT: Record<
  ReportHistoryTab,
  (props: ReportHistoryScreenProps) => React.ReactElement
> = {
  daily: ({ onOpenReport }) => (
    <DailyReportHistoryList onOpenReport={onOpenReport} />
  ),
  weekly: ({ onOpenWeeklyReport }) => (
    <WeeklyReportHistoryList onOpenReport={onOpenWeeklyReport} />
  ),
};

/**
 * SCR-14 Report History (F-DR-05 / F-WR-03, UF §15 / §28; Figma 31:746 /
 * 31:857 / 31:933): TopBar "سجلّ التقارير" with the back control top-right
 * (UF §31), a 2-segment SegmentedControl (Daily first, rightmost) and the
 * chosen chronological list. Progress tab → History (UF §26). Tab
 * selection is UI-only state local to the screen (TS §26).
 */
export function ReportHistoryScreen({
  onOpenReport,
  onOpenWeeklyReport,
  initialTab = 'daily',
}: ReportHistoryScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<ReportHistoryTab>(initialTab);

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/student');
    }
  };

  const Content = TAB_CONTENT[tab];

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="report-history-screen"
    >
      <TopBar title="سجلّ التقارير" onBack={goBack} testID="report-history" />

      <View className="flex-1 px-4 pt-1 pb-6 gap-4">
        <SegmentedControl<ReportHistoryTab>
          options={TABS}
          value={tab}
          onChange={setTab}
          accessibilityLabel="نوع التقارير"
          testID="report-history-tabs"
        />

        <View className="flex-1" testID={`report-history-content-${tab}`}>
          <Content
            onOpenReport={onOpenReport}
            onOpenWeeklyReport={onOpenWeeklyReport}
          />
        </View>
      </View>
    </View>
  );
}
