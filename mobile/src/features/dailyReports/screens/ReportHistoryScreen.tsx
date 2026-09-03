import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { DailyReportHistoryList } from '../components/DailyReportHistoryList';

export type ReportHistoryTab = 'daily' | 'weekly';

export interface ReportHistoryScreenProps {
  /** Daily row tap → SCR-15 rendered from that row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
  /** Sub-tab shown on open; the Daily sub-tab is the default (UF §15). */
  initialTab?: ReportHistoryTab;
}

/** UF §15: "[Daily Reports] · [Weekly Reports] (two sub-tabs)". */
const TABS: ReadonlyArray<{ key: ReportHistoryTab; label: string }> = [
  { key: 'daily', label: 'التقارير اليومية' },
  { key: 'weekly', label: 'التقارير الأسبوعية' },
];

/**
 * Weekly sub-tab content until F-WR-03 lands (UF §23 "Weekly Reports
 * history — No weekly reports yet"). F-WR-03 replaces this single entry of
 * `TAB_CONTENT` with its own list; nothing else in the screen changes.
 */
function WeeklyReportsPlaceholder() {
  return (
    <View
      testID="weekly-reports-placeholder"
      className="w-full p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center gap-2"
      style={{ borderCurve: 'continuous' }}
    >
      <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
        لا توجد تقارير أسبوعية بعد
      </Text>
    </View>
  );
}

const TAB_CONTENT: Record<
  ReportHistoryTab,
  (props: ReportHistoryScreenProps) => React.ReactElement
> = {
  daily: ({ onOpenReport }) => (
    <DailyReportHistoryList onOpenReport={onOpenReport} />
  ),
  weekly: () => <WeeklyReportsPlaceholder />,
};

/**
 * SCR-14 Report History (F-DR-05, UF §15 / §28): "Two sub-tabs,
 * chronological list". Progress tab → History (UF §26). Tab selection is
 * UI-only state local to the screen (TS §26). Header layout mirrors SCR-10:
 * title on the reading side, back control top-right (UF §31).
 */
export function ReportHistoryScreen({
  onOpenReport,
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
      className="flex-1 bg-white dark:bg-gray-950 p-5 gap-4"
      testID="report-history-screen"
    >
      <View className="flex-row-reverse items-center justify-between">
        <Text
          className="flex-1 text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
          accessibilityRole="header"
          testID="report-history-title"
        >
          سجل التقارير
        </Text>
        <Pressable
          testID="report-history-back-button"
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

      {/* Sub-tabs: full-width segmented control (UF §29), leading tab on the right (UF §31). */}
      <View
        className="flex-row-reverse rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden"
        style={{ borderCurve: 'continuous' }}
        accessibilityRole="tablist"
        testID="report-history-tabs"
      >
        {TABS.map(({ key, label }) => {
          const selected = tab === key;
          return (
            <Pressable
              key={key}
              testID={`report-history-tab-${key}`}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              onPress={() => setTab(key)}
              className={`flex-1 min-h-[48px] items-center justify-center ${
                selected
                  ? 'bg-primary dark:bg-primary-600'
                  : 'bg-white dark:bg-gray-900'
              }`}
            >
              <Text
                className={`text-base font-semibold ${
                  selected ? 'text-white' : 'text-gray-800 dark:text-gray-200'
                }`}
                maxFontSizeMultiplier={1.4}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-1" testID={`report-history-content-${tab}`}>
        <Content onOpenReport={onOpenReport} />
      </View>
    </View>
  );
}
