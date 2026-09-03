import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import {
  DailyReportBlockReason,
  DailyReportType,
} from '@/shared/api/dailyReports.client';
import { useTodayReportStatus } from '@/features/dailyReports/hooks/useTodayReportStatus';

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
  group_archived: 'حلقتك لم تعد نشطة.',
  membership_inactive: 'عضويتك في الحلقة غير نشطة.',
};

interface ReportTypeCard {
  type: DailyReportType;
  title: string;
  description: string;
  testID: string;
}

/**
 * Three equal-weight cards, no default pre-selected (UF §15: labelling one as
 * "default" would quietly discourage honest Absent/Revision reporting).
 */
const REPORT_TYPE_CARDS: ReportTypeCard[] = [
  {
    type: 'Normal',
    title: 'تقرير عادي',
    description: 'حفظ ومراجعة يومية',
    testID: 'report-type-card-normal',
  },
  {
    type: 'Revision',
    title: 'تقرير مراجعة',
    description: 'مراجعة فقط، دون حفظ جديد',
    testID: 'report-type-card-revision',
  },
  {
    type: 'Absent',
    title: 'تقرير غياب',
    description: 'لم أتمكن من الحفظ اليوم',
    testID: 'report-type-card-absent',
  },
];

/**
 * SCR-09 Report Type Selection (F-DR-01, UF §15 "Type selection").
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
      <View
        testID="report-type-selection-error"
        accessibilityRole="alert"
        className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-5 gap-3"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row items-center justify-center gap-2">
          <Text
            testID="report-type-selection-error-icon"
            accessibilityLabel="تنبيه"
            className="text-base"
          >
            ⚠️
          </Text>
          <Text className="text-destructive-800 dark:text-destructive-200 text-base font-semibold text-center">
            خطأ في تحميل البيانات
          </Text>
        </View>
        <Text
          className="text-destructive-700 dark:text-destructive-300 text-sm text-center leading-relaxed"
          testID="report-type-selection-error-message"
        >
          {describeError(error)}
        </Text>
        <Button
          label="إعادة المحاولة"
          variant="outline"
          onPress={() => void refetch()}
          testID="report-type-selection-retry-button"
        />
      </View>
    );
  } else if (!data.can_submit) {
    const reason: DailyReportBlockReason =
      data.block_reason ?? 'membership_inactive';
    content = (
      <View
        testID="report-type-selection-blocked"
        accessibilityRole="alert"
        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 gap-3"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row items-center justify-end gap-2">
          <Text className="text-base font-semibold text-gray-900 dark:text-gray-100 text-right">
            لا يمكن إرسال تقرير اليوم
          </Text>
          <Text
            testID="report-type-selection-blocked-icon"
            accessibilityLabel="تنبيه"
            className="text-base"
          >
            ⚠️
          </Text>
        </View>
        <Text
          className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed"
          testID="report-type-selection-blocked-reason"
        >
          {BLOCK_MESSAGES[reason]}
        </Text>
        <Button
          label="العودة"
          variant="outline"
          onPress={goBack}
          testID="report-type-selection-back-button"
        />
      </View>
    );
  } else {
    content = (
      <View className="w-full gap-3" testID="report-type-cards">
        {REPORT_TYPE_CARDS.map((card) => (
          <Pressable
            key={card.type}
            testID={card.testID}
            accessibilityRole="button"
            accessibilityLabel={`${card.title}: ${card.description}`}
            onPress={() => onSelectType?.(card.type)}
            className="w-full min-h-[48px] p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 active:bg-primary-50 dark:active:bg-primary-950 active:border-primary gap-1"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right">
              {card.title}
            </Text>
            <Text className="text-sm text-gray-600 dark:text-gray-400 text-right leading-relaxed">
              {card.description}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 20 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="report-type-selection-screen"
    >
      <View className="w-full max-w-md self-center gap-5">
        <View className="gap-1">
          <Text
            className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
            accessibilityRole="header"
          >
            اختر نوع التقرير
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-right">
            تقرير اليوم يُرسل مرة واحدة ولا يمكن تعديله بعد الإرسال.
          </Text>
        </View>

        {content}
      </View>
    </ScrollView>
  );
}
