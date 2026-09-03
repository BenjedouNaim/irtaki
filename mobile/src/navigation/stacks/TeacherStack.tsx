import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Icon,
  Banner,
  Button,
  EmptyState,
  ListRow,
  SkeletonLoader,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { rowStart, itemsStart } from '@/shared/theme/rtl';
import { logoutUser } from '@/shared/api/auth.client';
import { listGroups, GroupListItem } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';
import { formatArabicCount, GROUP_COUNT_FORMS } from '@/shared/utils/format';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل المجموعات';
/** Figma SCR-22 · empty (37:83): factual, no CTA (UF §23). */
const EMPTY_MESSAGE = 'لم تُسند إليك أي مجموعة بعد';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.statusCode >= 500
      ? SERVER_ERROR_MESSAGE
      : error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * SCR-22 Teacher Home (Figma 37:2 / 37:83, UF §10 "Home is the groups
 * list"): the assigned groups (`GET /groups`, Teacher (g) — only in-scope
 * groups ever appear, UF §8), one GroupCard per group leading to SCR-23.
 * The card's three performance metrics (submission rate, at-risk count,
 * average commitment) and the "current week" greeting need the unbuilt
 * performance data, so the card carries the group's own fields only —
 * never a fabricated number.
 */
export function TeacherStack() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await listGroups();
      setGroups(response.data);
    } catch (err) {
      setErrorMessage(describeError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

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

  const openRoster = (groupId: string) => {
    router.push({
      pathname: '/(app)/teacher/groups/[id]/roster',
      params: { id: groupId },
    });
  };

  let content: React.ReactElement;
  if (isLoading) {
    content = (
      <View testID="teacher-groups-skeleton" className="w-full">
        <SkeletonLoader variant="row" count={3} />
      </View>
    );
  } else if (errorMessage) {
    content = (
      <Banner
        tone="error"
        message={errorMessage}
        onRetry={fetchGroups}
        testID="teacher-groups-error"
      />
    );
  } else if (groups.length === 0) {
    content = (
      <EmptyState
        icon="layers"
        message={EMPTY_MESSAGE}
        testID="teacher-groups-empty"
      />
    );
  } else {
    content = (
      <View className="w-full gap-3 pt-1" testID="teacher-groups-list">
        {groups.map((group) => {
          const enrollment =
            group.enrollment_status === 'Open'
              ? 'التسجيل مفتوح'
              : 'التسجيل مغلق';
          const meta = `${getRecitationDayName(group.recitation_day)} · ${enrollment}`;
          return (
            <Pressable
              key={group.id}
              testID={`teacher-group-row-${group.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${group.name}، ${meta}`}
              onPress={() => openRoster(group.id)}
              className="w-full rounded-lg bg-surface dark:bg-surface-dark border border-line dark:border-line-dark p-[18px] active:opacity-80"
              style={{ borderCurve: 'continuous' }}
            >
              <View className={`${rowStart} items-center gap-2.5 w-full`}>
                <View
                  className="w-10 h-10 rounded-md bg-primary-subtle dark:bg-primary-subtle-dark items-center justify-center"
                  style={{ borderCurve: 'continuous' }}
                >
                  <Icon name="layers" size={20} tone="brand" />
                </View>
                <View className={`flex-1 ${itemsStart}`}>
                  <Text
                    numberOfLines={1}
                    className={`w-full ${typography.headingSm} text-right text-fg dark:text-fg-dark`}
                    maxFontSizeMultiplier={1.6}
                  >
                    {group.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    className={`w-full ${typography.caption} text-right text-fg-secondary dark:text-fg-secondary-dark`}
                    testID={`teacher-group-meta-${group.id}`}
                  >
                    {meta}
                  </Text>
                </View>
                <Icon name="chevron-left" size={18} tone="tertiary" />
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-canvas dark:bg-canvas-dark"
      testID="teacher-stack"
    >
      <TopBar title="مجموعاتي" back={false} testID="teacher-top-bar" />
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        {!isLoading && !errorMessage ? (
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="teacher-greeting"
          >
            {`معلّم · ${formatArabicCount(groups.length, GROUP_COUNT_FORMS)}`}
          </Text>
        ) : null}

        {content}

        <View className="w-full gap-3 mt-auto pt-4">
          <ListRow
            title="الملف الشخصي"
            leadingIcon="user"
            onPress={() => router.push('/(app)/profile')}
            testID="profile-button"
          />
          <Button
            label="تسجيل الخروج"
            variant="secondary"
            loading={isLoggingOut}
            onPress={handleLogout}
            testID="logout-button"
          />
        </View>
      </ScrollView>
    </View>
  );
}
