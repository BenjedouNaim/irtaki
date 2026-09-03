import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import { DailyReportDto } from '@/shared/api/dailyReports.client';
import { useOwnDailyReports } from '../hooks/useOwnDailyReports';
import { DailyReportRow } from './DailyReportRow';

export interface DailyReportHistoryListProps {
  /** Row tap → SCR-15 rendered from this row (F-DR-07). */
  onOpenReport?: (report: DailyReportDto) => void;
  testID?: string;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجل التقارير';
/** UF §23 "Daily Reports history — No reports yet". */
const EMPTY_MESSAGE = 'لا توجد تقارير بعد';

/**
 * Maps a query error to the user-facing Arabic message per UF §24's table:
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

function ErrorBanner({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-4 gap-3"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row-reverse items-center gap-2">
        <Text
          testID={`${testID}-icon`}
          accessibilityLabel="تنبيه"
          className="text-base"
        >
          ⚠️
        </Text>
        <Text
          className="flex-1 text-destructive-800 dark:text-destructive-200 text-sm text-right leading-relaxed"
          testID={`${testID}-message`}
        >
          {message}
        </Text>
      </View>
      <Button
        label="إعادة المحاولة"
        variant="outline"
        onPress={onRetry}
        testID={`${testID}-retry-button`}
      />
    </View>
  );
}

/**
 * SCR-14 Daily sub-tab content (F-DR-05, UF §15 "Report History"): the
 * caller's own reports, `report_date DESC`, cursor-paginated infinite
 * scroll (`limit=20`). Skeleton rows on first load, a small inline spinner
 * at the list bottom while the next page loads (UF §22), an appended
 * retry banner if that page fails, and the UF §23 empty state. This exact
 * component is what SCR-25 reuses for the Teacher's raw-report view.
 */
export function DailyReportHistoryList({
  onOpenReport,
  testID = 'daily-report-history',
}: DailyReportHistoryListProps) {
  const {
    data,
    error,
    isLoading,
    isError,
    isRefetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = useOwnDailyReports();

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  if (isLoading && !data) {
    return (
      <View testID={`${testID}-skeleton`} className="w-full">
        <SkeletonLoader variant="reportRow" count={5} />
      </View>
    );
  }

  // A failed first page replaces the content (UF §29 "inline" variant);
  // a failed *next* page is appended below the rows already shown.
  if (isError && !data) {
    return (
      <ErrorBanner
        message={describeError(error)}
        onRetry={() => void refetch()}
        testID={`${testID}-error`}
      />
    );
  }

  const reports = data ?? [];

  if (reports.length === 0) {
    return (
      <View
        testID={`${testID}-empty`}
        className="w-full p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center gap-2"
        style={{ borderCurve: 'continuous' }}
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
          {EMPTY_MESSAGE}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID={`${testID}-list`}
      data={reports}
      keyExtractor={(report) => report.id}
      renderItem={({ item }) => (
        <DailyReportRow report={item} onPress={onOpenReport} />
      )}
      contentContainerStyle={{ gap: 12, paddingBottom: 40 }}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={() => void refetch()}
        />
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View
            testID={`${testID}-loading-more`}
            className="py-4 items-center justify-center"
          >
            <ActivityIndicator size="small" />
          </View>
        ) : isFetchNextPageError ? (
          <ErrorBanner
            message={describeError(error)}
            onRetry={() => void fetchNextPage()}
            testID={`${testID}-page-error`}
          />
        ) : null
      }
    />
  );
}
