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
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import {
  listPendingJoinRequests,
  JoinRequestQueueItem,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';
import { JoinRequestQueueRow } from '../components/JoinRequestQueueRow';

export function JoinRequestsQueueScreen() {
  const router = useRouter();
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
    <ScrollView
      className="flex-1 bg-gray-50 dark:bg-gray-950"
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="join-requests-queue-screen"
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Screen Header */}
      <View className="flex-row-reverse items-center justify-between">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right">
            طلبات الانضمام
          </Text>
          <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
            مراجعة وتقييم طلبات المتقدمين للحلقات
          </Text>
        </View>
      </View>

      {/* State rendering */}
      {isLoading ? (
        <View testID="join-requests-skeleton" className="gap-3">
          <SkeletonLoader variant="row" count={4} />
        </View>
      ) : errorMessage ? (
        <View
          className="p-4 rounded-xl bg-destructive-50 border border-destructive-200 dark:bg-destructive-950 dark:border-destructive-800 gap-3"
          style={{ borderCurve: 'continuous' }}
          testID="join-requests-error"
        >
          <Text
            selectable
            className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right leading-5"
          >
            {errorMessage}
          </Text>
          <Button
            label="إعادة المحاولة"
            variant="outline"
            onPress={fetchInitialRequests}
            testID="retry-button"
          />
        </View>
      ) : requests.length === 0 ? (
        <View
          testID="join-requests-empty"
          className="p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center text-center gap-3 mt-4"
          style={{ borderCurve: 'continuous' }}
        >
          <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
            لا توجد طلبات معلقة
          </Text>
          <Text className="text-sm text-gray-500 dark:text-gray-400 text-center leading-5">
            لا توجد حالياً أي طلبات انضمام جديدة بحاجة إلى المراجعة للحلقات
            المسندة إليك.
          </Text>
        </View>
      ) : (
        <View className="gap-3" testID="join-requests-content">
          {requests.map((item) => (
            <JoinRequestQueueRow
              key={item.id}
              item={item}
              onPress={handleRequestPress}
            />
          ))}

          {/* Pagination loading / Load more */}
          {isLoadingMore && (
            <View
              testID="pagination-loading"
              className="py-4 items-center justify-center"
            >
              <ActivityIndicator size="small" />
            </View>
          )}

          {hasMore && !isLoadingMore && (
            <Button
              label="تحميل المزيد"
              variant="outline"
              onPress={handleLoadMore}
              testID="load-more-button"
              className="mt-2"
            />
          )}
        </View>
      )}
    </ScrollView>
  );
}
