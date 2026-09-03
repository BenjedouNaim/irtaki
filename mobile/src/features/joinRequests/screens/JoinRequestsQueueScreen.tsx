import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { EmptyState } from '@/shared/components/EmptyState';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { useThemeColors } from '@/shared/theme/colors';
import { rowStart } from '@/shared/theme/rtl';
import { AssistantTabBar } from '@/navigation/AssistantTabBar';
import {
  listPendingJoinRequests,
  JoinRequestQueueItem,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';
import { JoinRequestQueueRow } from '../components/JoinRequestQueueRow';

/** "N pending requests" with Arabic number agreement (Figma 34:145). */
export function pendingCountLabel(count: number): string {
  if (count === 1) return 'طلب واحد معلّق';
  if (count === 2) return 'طلبان معلّقان';
  if (count <= 10) return `${count} طلبات معلّقة`;
  return `${count} طلبًا معلّقًا`;
}

/**
 * SCR-18 Join Requests Queue (Figma 34:115 / 34:222): score-sorted list,
 * fixed order (UF §13), one row per pending request in the assistant's
 * assigned groups; cursor pagination (APIS §9).
 */
export function JoinRequestsQueueScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const [requests, setRequests] = useState<JoinRequestQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchInitialRequests = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listPendingJoinRequests();
      setRequests(response.data);
      setNextCursor(response.pagination.next_cursor);
      setHasMore(response.pagination.has_more);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل قائمة طلبات الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await listPendingJoinRequests();
      setRequests(response.data);
      setNextCursor(response.pagination.next_cursor);
      setHasMore(response.pagination.has_more);
      if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحديث طلبات الانضمام');
      } else {
        setErrorMessage('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingMore) {
      return;
    }
    setIsLoadingMore(true);
    try {
      const response = await listPendingJoinRequests({ cursor: nextCursor });
      setRequests((prev) => [...prev, ...response.data]);
      setNextCursor(response.pagination.next_cursor);
      setHasMore(response.pagination.has_more);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل المزيد من الطلبات');
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, nextCursor, isLoadingMore]);

  useEffect(() => {
    fetchInitialRequests();
  }, [fetchInitialRequests]);

  const handleRequestPress = (requestId: string) => {
    if (process.env.EXPO_OS === 'ios' || process.env.EXPO_OS === 'android') {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {
        // Fallback
      }
    }
    router.push({
      pathname: '/(app)/assistant/join-requests/[id]',
      params: { id: requestId },
    });
  };

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="join-requests-queue-screen"
    >
      <TopBar
        title="طلبات الانضمام"
        back={false}
        testID="join-requests-top-bar"
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textBrand}
            colors={[colors.textBrand]}
          />
        }
      >
        {isLoading ? (
          <SkeletonLoader
            variant="row"
            count={4}
            testID="join-requests-skeleton"
          />
        ) : errorMessage ? (
          <Banner
            message={errorMessage}
            tone="error"
            onRetry={fetchInitialRequests}
            testID="join-requests-error"
          />
        ) : requests.length === 0 ? (
          <EmptyState
            message="لا توجد طلبات معلّقة"
            icon="inbox"
            testID="join-requests-empty"
          />
        ) : (
          <>
            <View
              className={`${rowStart} items-center justify-between gap-3 w-full`}
              testID="join-requests-head"
            >
              <Text
                className={`${typography.headingSm} text-right text-fg dark:text-fg-dark`}
                testID="join-requests-count"
                accessibilityRole="header"
              >
                {hasMore ? 'طلبات معلّقة' : pendingCountLabel(requests.length)}
              </Text>
              <Text
                className={`${typography.caption} text-left text-fg-tertiary dark:text-fg-tertiary-dark`}
              >
                ترتيب ثابت: الأعلى نقاطًا أولًا
              </Text>
            </View>

            <View className="w-full gap-2.5" testID="join-requests-content">
              {requests.map((item) => (
                <JoinRequestQueueRow
                  key={item.id}
                  item={item}
                  onPress={handleRequestPress}
                />
              ))}

              {isLoadingMore && (
                <View
                  testID="pagination-loading"
                  className="py-4 items-center justify-center"
                >
                  <ActivityIndicator size="small" color={colors.textBrand} />
                </View>
              )}

              {hasMore && !isLoadingMore && (
                <Button
                  label="تحميل المزيد"
                  variant="secondary"
                  onPress={handleLoadMore}
                  testID="load-more-button"
                  className="mt-1 w-full"
                />
              )}
            </View>
          </>
        )}
      </ScrollView>

      <AssistantTabBar activeKey="join-requests" />
    </View>
  );
}
