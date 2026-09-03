import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner } from '@/shared/components/Banner';
import { Button } from '@/shared/components/Button';
import { EmptyState } from '@/shared/components/EmptyState';
import { Icon } from '@/shared/components/Icon';
import { ListRow } from '@/shared/components/ListRow';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { TopBar } from '@/shared/components/TopBar';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { AssistantTabBar } from '@/navigation/AssistantTabBar';
import { logoutUser } from '@/shared/api/auth.client';
import { listGroups, GroupListItem } from '@/shared/api/groups.client';
import { getMe, MeResponse } from '@/shared/api/me.client';
import { ApiError } from '@/shared/api/types';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل المجموعات';
/** UF §23 "Assistant with no groups — No groups assigned yet". */
const EMPTY_MESSAGE = 'لم تُسند إليك أي مجموعة بعد — الإسناد من صلاحيات المدير';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.statusCode >= 500
      ? SERVER_ERROR_MESSAGE
      : error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/** "N assigned groups" with Arabic number agreement. */
export function assignedGroupsLabel(count: number): string {
  if (count === 0) return 'لا مجموعات مُسندة بعد';
  if (count === 1) return 'مجموعة واحدة مُسندة';
  if (count === 2) return 'مجموعتان مُسندتان';
  if (count <= 10) return `${count} مجموعات مُسندة`;
  return `${count} مجموعة مُسندة`;
}

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/**
 * SCR-17 Assistant Home (Figma 34:2 / 53:697): greeting, the assigned
 * groups (`GET /groups`, Assistant (g)) and the Assistant tab bar. The
 * summary tiles of the design read `GET /me/dashboard`, which has no client
 * yet, so they are omitted rather than faked.
 */
export function AssistantTabs() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchHome = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const [meResult, groupsResult] = await Promise.allSettled([
      getMe(),
      listGroups(),
    ]);
    if (meResult.status === 'fulfilled') {
      setMe(meResult.value);
    }
    if (groupsResult.status === 'fulfilled') {
      setGroups(groupsResult.value.data);
    } else {
      setErrorMessage(describeError(groupsResult.reason));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchHome();
  }, [fetchHome]);

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

  const name = firstName(me?.full_name);
  const roleLabel = me?.gender === 'Female' ? 'مساعدة' : 'مساعد';
  const subtitle =
    isLoading || errorMessage
      ? roleLabel
      : `${roleLabel} · ${assignedGroupsLabel(groups.length)}`;

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="assistant-tabs"
    >
      <TopBar
        title="الرئيسية"
        back={false}
        testID="assistant-home-top-bar"
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
          paddingTop: 4,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 16,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className={`w-full gap-0.5 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
            testID="assistant-home-greeting"
          >
            {name ? `مرحبًا، ${name}` : 'مرحبًا'}
          </Text>
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="assistant-home-subtitle"
          >
            {subtitle}
          </Text>
        </View>

        {isLoading ? (
          <SkeletonLoader
            variant="row"
            count={2}
            testID="assistant-home-loading"
          />
        ) : errorMessage ? (
          <Banner
            message={errorMessage}
            tone="error"
            onRetry={fetchHome}
            testID="assistant-home-error"
          />
        ) : groups.length === 0 ? (
          <EmptyState
            message={EMPTY_MESSAGE}
            icon="layers"
            testID="assistant-home-empty"
          />
        ) : (
          <>
            <Text
              className={`w-full pt-2 ${typography.overline} text-right text-fg-secondary dark:text-fg-secondary-dark`}
              accessibilityRole="header"
            >
              مجموعاتك
            </Text>
            <View className="w-full gap-2.5" testID="assistant-home-groups">
              {groups.map((group) => (
                <ListRow
                  key={group.id}
                  title={group.name}
                  subtitle={`يوم التسميع: ${getRecitationDayName(group.recitation_day)}`}
                  leadingIcon="layers"
                  trailing="none"
                  testID={`assistant-group-row-${group.id}`}
                />
              ))}
            </View>
          </>
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

      <AssistantTabBar activeKey="home" />
    </View>
  );
}
