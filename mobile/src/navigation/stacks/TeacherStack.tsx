import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Banner,
  Button,
  EmptyState,
  ListRow,
  SkeletonLoader,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { logoutUser } from '@/shared/api/auth.client';
import type { TeacherDashboardDto } from '@/shared/api/dashboard.client';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { describeDashboardError } from '@/features/dashboard/utils/dashboardCopy';
import { TeacherGroupCard } from '@/features/dashboard/components/TeacherGroupCard';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';
import { formatArabicCount, GROUP_COUNT_FORMS } from '@/shared/utils/format';

/** Figma SCR-22 · empty (37:83): factual, no CTA (UF §23). */
const EMPTY_MESSAGE = 'لم تُسند إليك أي مجموعة بعد';

/**
 * SCR-22 Teacher Home (Figma 37:2 / 37:83, UF §10 "Home *is* the groups
 * list, no separate summary layer"): one GroupCard per assigned group,
 * carrying that group's `commitment_average`, `at_risk_count` and
 * `submission_rate`, all from the ONE `GET /me/dashboard` call (F-DASH-01 /
 * API-009). The card taps through to SCR-23.
 *
 * The screen's previous `GET /groups` request is gone — the dashboard names
 * each assigned group, already scope-filtered by the server, so listing them
 * twice would fetch the same rows twice. Figma's per-group subtitle
 * ("السبت · 18 طالبًا") goes with it: neither the recitation day nor a member
 * count is in API-009's Teacher payload, and a second call for them would
 * undo the round trip the endpoint exists for.
 *
 * A group with no defined rate renders the null state, never `0%`
 * (DEC-B04 / API-X07); zero assigned groups is UF §10's "No groups assigned
 * yet" with no CTA, since assignment is the Admin's action.
 */
export function TeacherStack() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data, isLoading, isError, error, refetch } =
    useDashboard<TeacherDashboardDto>();
  const groups = data?.groups ?? [];

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
  if (isLoading && !data) {
    content = (
      <View testID="teacher-groups-skeleton" className="w-full">
        <SkeletonLoader variant="groupPerformance" count={2} />
      </View>
    );
  } else if (isError || !data) {
    content = (
      <Banner
        tone="error"
        message={describeDashboardError(error)}
        onRetry={() => void refetch()}
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
        {groups.map((group) => (
          <TeacherGroupCard
            key={group.id}
            group={group}
            onPress={() => openRoster(group.id)}
            testID={`teacher-group-row-${group.id}`}
          />
        ))}
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
        {data ? (
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="teacher-greeting"
          >
            {`معلّم · ${formatArabicCount(groups.length, GROUP_COUNT_FORMS)} · الأسبوع الحالي`}
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
