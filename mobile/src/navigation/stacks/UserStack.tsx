import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { Icon } from '@/shared/components/Icon';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import {
  JoinRequestStatusCard,
  NoJoinRequestCard,
} from '@/features/joinRequests/components/JoinRequestStatusCard';
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

/**
 * SCR-05 User Home (Figma 22:2 / 22:48 / 22:92): greeting + one status
 * card driven by `GET /join-requests/mine` (UF §10). The trailing top-bar
 * slot leads to the profile (SCR-34); the notification bell of the design
 * is not built (SCR-35 is out of scope).
 */
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

  const openStepper = () => router.push('/(app)/user/join-stepper');

  return (
    <View className="flex-1 bg-canvas dark:bg-canvas-dark" testID="user-stack">
      <TopBar
        title="ارتقِ"
        back={false}
        testID="user-stack-top-bar"
        trailing={
          <Pressable
            testID="profile-button"
            onPress={() => router.push('/(app)/profile')}
            accessibilityRole="button"
            accessibilityLabel="الملف الشخصي"
            hitSlop={4}
            className="w-10 h-10 rounded-full items-center justify-center active:opacity-80"
          >
            <Icon name="user" size={22} tone="primary" />
          </Pressable>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 24,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className={`w-full gap-1 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingXl} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
          >
            أهلًا بك
          </Text>
          <Text
            className={`w-full ${typography.bodyMd} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          >
            حسابك جاهز — الخطوة التالية هي الانضمام إلى مجموعة.
          </Text>
        </View>

        {isLoading ? (
          <View
            className="w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark"
            style={{ borderCurve: 'continuous' }}
          >
            <SkeletonLoader variant="card" testID="user-stack-loading" />
          </View>
        ) : errorMessage ? (
          <Banner
            message={errorMessage}
            tone="error"
            onRetry={fetchStatus}
            testID="user-stack-error-banner"
          />
        ) : joinRequest ? (
          <JoinRequestStatusCard
            status={joinRequest.status}
            onApplyAgain={openStepper}
            testID="join-request-status-card"
          />
        ) : (
          <NoJoinRequestCard onBrowseGroups={openStepper} />
        )}

        <Button
          label="تسجيل الخروج"
          variant="ghost"
          loading={isLoggingOut}
          onPress={handleLogout}
          testID="logout-button"
          className="w-full"
        />
      </ScrollView>
    </View>
  );
}
