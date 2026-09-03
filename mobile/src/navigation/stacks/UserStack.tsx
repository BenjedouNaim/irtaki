import React, { useState } from 'react';
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
import type { UserDashboardDto } from '@/shared/api/dashboard.client';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { describeDashboardError } from '@/features/dashboard/utils/dashboardCopy';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

/**
 * SCR-05 User Home (Figma 22:2 / 22:48 / 22:92): greeting + one status card,
 * from the ONE `GET /me/dashboard` call (F-DASH-01 / API-009, UF §10 "Every
 * dashboard is one `GET /me/dashboard` call"). The card itself is F-ENR-02's
 * `JoinRequestStatusCard`, unchanged — only its data source moved, so this
 * screen no longer issues the standalone `GET /join-requests/mine` request it
 * used to (that endpoint remains the applicant's own status read elsewhere;
 * nothing on this screen calls it any more, so no request is duplicated).
 *
 * `has_pending_request = false` with no `pending_request_status` means the
 * caller has never applied — the "Browse Groups" entry point. A terminal
 * `Rejected` keeps the status card plus "Apply again" (UF §10, DEC-C09: the
 * status, never a reason).
 *
 * The trailing top-bar slot leads to the profile (SCR-34); the notification
 * bell of the design is not built (SCR-35 is out of scope).
 */
export function UserStack() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data, isLoading, isError, error, refetch } =
    useDashboard<UserDashboardDto>();

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

        {isLoading && !data ? (
          <View
            className="w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark"
            style={{ borderCurve: 'continuous' }}
          >
            <SkeletonLoader variant="card" testID="user-stack-loading" />
          </View>
        ) : isError || !data ? (
          <Banner
            message={describeDashboardError(error)}
            tone="error"
            onRetry={() => void refetch()}
            testID="user-stack-error-banner"
          />
        ) : data.pending_request_status ? (
          <JoinRequestStatusCard
            status={data.pending_request_status}
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
