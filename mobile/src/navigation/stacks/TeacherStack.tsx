import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Button } from '@/shared/components/Button';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { SkeletonLoader } from '@/shared/components/SkeletonLoader';
import { logoutUser } from '@/shared/api/auth.client';
import { listGroups, GroupListItem } from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';
import { getRecitationDayName } from '@/features/joinRequests/screens/JoinStepperScreen';

import { useRouter } from 'expo-router';

/** Network unavailable (UF §24) — same copy as every other screen. */
const NETWORK_ERROR_MESSAGE =
  'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
/** Server error 5xx (UF §24) — generic, never the server's own message. */
const SERVER_ERROR_MESSAGE = 'حدث خطأ أثناء تحميل الحلقات';
/** UF §23 "Teacher's groups — No groups assigned yet", no CTA. */
const EMPTY_MESSAGE = 'لا توجد حلقات مسندة إليك بعد';

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.statusCode >= 500
      ? SERVER_ERROR_MESSAGE
      : error.message || SERVER_ERROR_MESSAGE;
  }
  return NETWORK_ERROR_MESSAGE;
}

/**
 * Teacher Home (SCR-22 stub, UF §10 "Home is the groups list"): the
 * assigned groups (`GET /groups`, Teacher (g) — only in-scope groups ever
 * appear, UF §8), one card per group leading to its student list, from
 * which a student's raw daily reports (SCR-25, F-DR-06) are reached
 * (UF §26 "Group Detail → Student row → … → Raw Reports"). The dashboard
 * metrics of the full SCR-22 card arrive with F-DASH; until then the card
 * carries the group's own fields only.
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
      <View testID="teacher-groups-skeleton" className="w-full gap-3">
        <SkeletonLoader variant="row" count={3} />
      </View>
    );
  } else if (errorMessage) {
    content = (
      <View
        testID="teacher-groups-error"
        accessibilityRole="alert"
        className="w-full bg-destructive-50 dark:bg-destructive-950 border border-destructive-200 dark:border-destructive-800 rounded-xl p-4 gap-3"
        style={{ borderCurve: 'continuous' }}
      >
        <View className="flex-row-reverse items-center gap-2">
          <Text accessibilityLabel="تنبيه" className="text-base">
            ⚠️
          </Text>
          <Text
            className="flex-1 text-destructive-800 dark:text-destructive-200 text-sm text-right leading-relaxed"
            testID="teacher-groups-error-message"
          >
            {errorMessage}
          </Text>
        </View>
        <Button
          label="إعادة المحاولة"
          variant="outline"
          onPress={fetchGroups}
          testID="teacher-groups-retry-button"
        />
      </View>
    );
  } else if (groups.length === 0) {
    content = (
      <View
        testID="teacher-groups-empty"
        className="w-full p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 items-center gap-2"
        style={{ borderCurve: 'continuous' }}
      >
        <Text className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center">
          {EMPTY_MESSAGE}
        </Text>
      </View>
    );
  } else {
    content = (
      <View className="w-full gap-3" testID="teacher-groups-list">
        {groups.map((group) => (
          <Pressable
            key={group.id}
            testID={`teacher-group-row-${group.id}`}
            accessibilityRole="button"
            accessibilityLabel={`حلقة ${group.name}`}
            onPress={() => openRoster(group.id)}
            className="min-h-[64px] p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 active:border-primary dark:active:border-primary-500 gap-2"
            style={{ borderCurve: 'continuous' }}
          >
            <View className="flex-row-reverse items-center justify-between gap-2">
              <Text
                selectable
                className="text-lg font-bold text-gray-900 dark:text-gray-100 text-right flex-1"
                maxFontSizeMultiplier={1.6}
              >
                {group.name}
              </Text>
              <StatusBadge
                status={
                  group.enrollment_status === 'Open'
                    ? 'مفتوح للتسجيل'
                    : 'مغلق للتسجيل'
                }
                variant={
                  group.enrollment_status === 'Open' ? 'success' : 'neutral'
                }
                testID={`teacher-group-enrollment-badge-${group.id}`}
              />
            </View>
            <Text className="text-xs text-gray-500 dark:text-gray-400 text-right">
              {`يوم التسميع: ${getRecitationDayName(group.recitation_day)}`}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-gray-950"
      contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 16 }}
      contentInsetAdjustmentBehavior="automatic"
      testID="teacher-stack"
    >
      <Text
        className="text-2xl font-bold text-gray-900 dark:text-gray-100 text-right"
        accessibilityRole="header"
      >
        حلقاتي
      </Text>

      {content}

      <View className="w-full gap-3 mt-auto">
        <Button
          label="الملف الشخصي"
          variant="outline"
          onPress={() => router.push('/(app)/profile')}
          testID="profile-button"
        />
        <Button
          label="تسجيل الخروج"
          variant="destructive"
          loading={isLoggingOut}
          onPress={handleLogout}
          testID="logout-button"
        />
      </View>
    </ScrollView>
  );
}
