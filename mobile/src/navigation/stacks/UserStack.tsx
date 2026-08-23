import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/shared/components/Button';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { JoinRequestStatusCard } from '@/features/joinRequests/components/JoinRequestStatusCard';
import {
  getMyJoinRequest,
  GetMyJoinRequestResponse,
} from '@/shared/api/joinRequests.client';
import { ApiError } from '@/shared/api/types';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

export function UserStack() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [joinRequest, setJoinRequest] = useState<
    GetMyJoinRequestResponse['data'] | null
  >(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getMyJoinRequest();
      setJoinRequest(res.data);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.statusCode === 404) {
        // Fresh user: no join request submitted yet
        setJoinRequest(null);
      } else if (err instanceof ApiError) {
        setErrorMessage(err.message || 'تعذر تحميل حالة طلب الانضمام');
      } else {
        setErrorMessage(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.',
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const refreshToken = await getStoredRefreshToken();
      if (refreshToken) {
        await logoutUser(refreshToken);
      }
    } catch {
      // Best effort logout on API failure
    } finally {
      await deleteStoredRefreshToken();
      useAuthStore.getState().clearSession();
      setIsLoggingOut(false);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
      contentInsetAdjustmentBehavior="automatic"
      testID="user-stack"
    >
      <View className="w-full max-w-sm items-center">
        <Text className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
          حساب المستخدم
        </Text>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
          متابعة طلب الانضمام وتصفح الحلقات القرآنية
        </Text>

        {isLoading ? (
          <SkeletonLoader
            variant="dashboard"
            testID="user-stack-loading"
            className="mb-4"
          />
        ) : errorMessage ? (
          <View
            testID="user-stack-error-banner"
            className="w-full p-4 mb-5 bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl"
            style={{ borderCurve: 'continuous' }}
          >
            <Text className="text-sm font-medium text-destructive-700 dark:text-destructive-300 text-right mb-3">
              {errorMessage}
            </Text>
            <Button
              label="إعادة المحاولة"
              variant="outline"
              onPress={fetchStatus}
              testID="retry-button"
              className="w-full"
            />
          </View>
        ) : joinRequest ? (
          <View className="w-full mb-5">
            <JoinRequestStatusCard
              status={joinRequest.status}
              onApplyAgain={() => router.push('/(app)/user/join-stepper')}
              testID="join-request-status-card"
            />
          </View>
        ) : (
          <Button
            label="تصفح الحلقات المتاحة"
            variant="primary"
            onPress={() => router.push('/(app)/user/join-stepper')}
            testID="browse-groups-button"
            className="mb-3 w-full"
          />
        )}

        <Button
          label="الملف الشخصي"
          variant="outline"
          onPress={() => router.push('/(app)/profile')}
          testID="profile-button"
          className="mb-3 w-full"
        />

        <Button
          label="تسجيل الخروج"
          variant="destructive"
          loading={isLoggingOut}
          onPress={handleLogout}
          testID="logout-button"
          className="w-full"
        />
      </View>
    </ScrollView>
  );
}
