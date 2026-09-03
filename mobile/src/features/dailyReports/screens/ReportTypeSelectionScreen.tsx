import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { ReportTypeCard, ReportType } from '@/shared/components/ReportTypeCard';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { ApiError } from '@/shared/api/types';
import {
  DailyReportBlockReason,
  DailyReportType,
} from '@/shared/api/dailyReports.client';
import { useTodayReportStatus } from '@/features/dailyReports/hooks/useTodayReportStatus';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';

export interface ReportTypeSelectionScreenProps {
  /**
   * Called with the chosen type. SCR-10 (Daily Report Form, F-DR-02) consumes
   * this; until it lands the cards are still tappable but lead nowhere.
   */
  onSelectType?: (type: DailyReportType) => void;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل حالة تقرير اليوم';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return SERVER_ERROR_MESSAGE;
    }
    return error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/** Why the screen cannot be used — the server's reason, never inferred (API-029). */
const BLOCK_MESSAGES: Record<DailyReportBlockReason, string> = {
  already_submitted: 'تم إرسال تقرير اليوم مسبقاً.',
  recitation_day: 'اليوم هو يوم التسميع، ولا يُرسل فيه تقرير يومي.',
  group_archived: 'مجموعتك لم تعد نشطة. لا يمكن إرسال التقارير حاليًا.',
  membership_inactive:
    'عضويتك في الحلقة غير نشطة. لا يمكن إرسال التقارير حاليًا.',
};

/**
 * Three equal-weight cards in the Figma order, no default pre-selected
 * (UF §15: labelling one as "default" would quietly discourage honest
 * Absent/Revision reporting). Card copy lives in the shared ReportTypeCard.
 */
const REPORT_TYPES: Array<{ card: ReportType; type: DailyReportType }> = [
  { card: 'normal', type: 'Normal' },
  { card: 'revision', type: 'Revision' },
  { card: 'absent', type: 'Absent' },
];

/**
 * SCR-09 Report Type Selection (F-DR-01, UF §15 "Type selection"; Figma
 * 26:331): TopBar "تقرير اليوم", heading + one line, ReportTypeCard ×3.
 *
 * Reachable only when `can_submit = true` (UF §28): the screen re-reads
 * API-029 and, if the server says submission is blocked, shows the reason
 * and a way back instead of the cards — the navigation layer hides the
 * route, the server decides (NFR-08).
 */
export function ReportTypeSelectionScreen({
  onSelectType,
}: ReportTypeSelectionScreenProps) {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useTodayReportStatus();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/student');
    }
  };

  let content: React.ReactNode;

  if (isLoading && !data) {
    content = (
      <SkeletonLoader
        variant="row"
        count={3}
        testID="report-type-selection-skeleton"
      />
    );
  } else if (isError || !data) {
    content = (
      <Banner
        tone="error"
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID="report-type-selection-error"
      />
    );
  } else if (!data.can_submit) {
    const reason: DailyReportBlockReason =
      data.block_reason ?? 'membership_inactive';
    content = (
      <View className="w-full gap-4" testID="report-type-selection-blocked">
        <Banner
          tone="warning"
          message={BLOCK_MESSAGES[reason]}
          testID="report-type-selection-blocked-banner"
        />
        <Button
          label="العودة"
          variant="outline"
          onPress={goBack}
          testID="report-type-selection-back-button"
          className="w-full"
        />
      </View>
    );
  } else {
    content = (
      <View className="w-full gap-3" testID="report-type-cards">
        {REPORT_TYPES.map(({ card, type }) => (
          <ReportTypeCard
            key={type}
            type={card}
            onPress={() => onSelectType?.(type)}
          />
        ))}
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="report-type-selection-screen"
    >
      <TopBar
        title="تقرير اليوم"
        onBack={goBack}
        testID="report-type-selection-top-bar"
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
      >
        <View className={`w-full gap-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
          >
            ما نوع تقرير اليوم؟
          </Text>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            لا خيار افتراضي — اختر ما يصف يومك بصدق.
          </Text>
        </View>

        {content}
      </ScrollView>
    </View>
  );
}
