import React, { useCallback } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Banner } from './Banner';
import { EmptyState } from './EmptyState';
import { IconName } from './icons';
import { SkeletonLoader, SkeletonVariant } from './SkeletonLoader';
import { ApiError } from '@/shared/api/types';
import { useThemeColors } from '@/shared/theme/colors';

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
  /** Figma EmptyState glyph for this history; defaults to icon/file-text. */
  emptyIcon?: IconName;
  /** UF §22 — the skeleton that matches THIS list's rows. */
  skeletonVariant?: SkeletonVariant;
  /**
   * UF §24 generic copy for a 5xx on this list. The server's own message is
   * never shown for a 5xx, so each list names what failed to load.
   */
  serverErrorMessage?: string;
  /**
   * Figma "Entries" card (42:606): the rows share ONE surface card with a
   * hairline between them, instead of each row standing as its own card.
   * SCR-33's flat chronological list is drawn this way.
   */
  grouped?: boolean;
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
function describeError(error: unknown, serverMessage: string): string {
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      return serverMessage;
    }
    return error.message || serverMessage;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * The one chronological history list of SCR-14 / SCR-25 (UF §15 "Report
 * History"): cursor-paginated infinite scroll, skeleton rows on first load,
 * a small inline spinner at the list bottom while the next page loads
 * (UF §22), an appended retry banner if that page fails, a replacing
 * banner if the first page fails (UF §24, icon + text per UF §32) and the
 * UF §23 empty state. The data source and the row are the caller's — the
 * Daily and Weekly sub-tabs, SCR-32's user directory (F-ADM-02) and SCR-33's
 * audit log (F-ADM-03) differ only in those, plus whether the rows stand as
 * separate cards or share one (`grouped`).
 */
export function ReportHistoryList<T extends { id: string }>({
  query,
  renderRow,
  emptyMessage,
  emptyIcon = 'file-text',
  skeletonVariant = 'reportRow',
  serverErrorMessage = SERVER_ERROR_MESSAGE,
  grouped = false,
  testID,
}: ReportHistoryListProps<T>) {
  const colors = useThemeColors();
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
        <SkeletonLoader variant={skeletonVariant} count={5} />
      </View>
    );
  }

  // A failed first page replaces the content (UF §29 "inline" variant);
  // a failed *next* page is appended below the rows already shown.
  if (isError && !data) {
    return (
      <Banner
        tone="error"
        message={describeError(error, serverErrorMessage)}
        onRetry={() => void refetch()}
        testID={`${testID}-error`}
      />
    );
  }

  const rows = data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        message={emptyMessage}
        icon={emptyIcon}
        testID={`${testID}-empty`}
      />
    );
  }

  return (
    <FlatList
      testID={`${testID}-list`}
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => renderRow(item)}
      contentContainerStyle={
        grouped
          ? {
              backgroundColor: colors.bgSurface,
              borderWidth: 1,
              borderColor: colors.borderDefault,
              borderRadius: 18,
              borderCurve: 'continuous',
              paddingHorizontal: 16,
              overflow: 'hidden',
            }
          : { gap: 10, paddingBottom: 40 }
      }
      ItemSeparatorComponent={
        grouped
          ? () => (
              <View
                testID={`${testID}-separator`}
                className="h-px w-full bg-line dark:bg-line-dark"
              />
            )
          : undefined
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching && !isFetchingNextPage}
          onRefresh={() => void refetch()}
          tintColor={colors.textBrand}
        />
      }
      ListFooterComponent={
        isFetchingNextPage ? (
          <View
            testID={`${testID}-loading-more`}
            className="pt-2 pb-4 items-center justify-center"
          >
            <ActivityIndicator size="small" color={colors.textTertiary} />
          </View>
        ) : isFetchNextPageError ? (
          <Banner
            tone="error"
            message={describeError(error, serverErrorMessage)}
            onRetry={() => void fetchNextPage()}
            testID={`${testID}-page-error`}
          />
        ) : null
      }
    />
  );
}
