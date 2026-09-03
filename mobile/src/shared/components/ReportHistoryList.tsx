import React, { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Button } from './Button';
import { SkeletonLoader } from './SkeletonLoader';
import { ApiError } from '@/shared/api/types';

/**
 * The slice of a flattened infinite query (TanStack `useInfiniteQuery`
 * with a `select` that flattens the pages) the list needs — structural,
 * so any history hook fits without importing TanStack's result types.
 */
export interface ReportHistoryQuery<T> {
  data: T[] | undefined;
  error: unknown;
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
}

export interface ReportHistoryListProps<T extends { id: string }> {
  query: ReportHistoryQuery<T>;
  renderRow: (item: T) => React.ReactElement;
  /** UF §23 factual empty-state copy for this history. */
  emptyMessage: string;
  testID: string;
}

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24 / TS §29) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل سجل التقارير';

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
 * The one chronological history list of SCR-14 / SCR-25 (UF §15 "Report
 * History"): cursor-paginated infinite scroll, skeleton rows on first load,
 * a small inline spinner at the list bottom while the next page loads
 * (UF §22), an appended retry banner if that page fails, a replacing
 * banner if the first page fails (UF §24, icon + text per UF §32) and the
 * UF §23 empty state. The data source and the row are the caller's — the
 * Daily and Weekly sub-tabs differ only in those.
 */
export function ReportHistoryList<T extends { id: string }>({
  query,
  renderRow,
  emptyMessage,
  testID,
}: ReportHistoryListProps<T>) {
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
  } = query;

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

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <View
        testID={`${testID}-empty`}
        className="w-full p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center gap-2"
        style={{ borderCurve: 'continuous' }}
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
          {emptyMessage}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      testID={`${testID}-list`}
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderRow(item)}
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
