import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import {
  TopBar,
  Banner,
  Button,
  Icon,
  ListRow,
  SkeletonLoader,
} from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { logoutUser } from '@/shared/api/auth.client';
import type { AdminDashboardDto } from '@/shared/api/dashboard.client';
import { useDashboard } from '@/features/dashboard/hooks/useDashboard';
import { describeDashboardError } from '@/features/dashboard/utils/dashboardCopy';
import { AdminSummaryTiles } from '@/features/admin/components/AdminSummaryTiles';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

/** Figma 39:35 — the role line under the frame's centre-name headline. */
const ROLE_LINE = 'مدير · قراءة كاملة، وإعدادات هيكلية فقط';

/**
 * SCR-26 Admin Home (Figma 39:2, UF §10 / §28 "Menu hub"): the role line, the
 * four dashboard tiles and the three menu rows that are Admin's real
 * workflow — Groups (F-GRP-10), Staff & Users (F-ADM-02) and the Audit Log
 * (F-ADM-03).
 *
 * The tiles are F-ADM-04's `AdminSummaryTiles` shell, unchanged: F-DASH-03
 * only hands it the four counts from the ONE `GET /me/dashboard` call
 * (API-009, F-DASH-01). Until the call resolves they keep rendering
 * MetricTile's Null state rather than a placeholder zero (DEC-B04), and the
 * group and staff tiles keep UF §10's tap targets. The menu rows never
 * depend on the call, so a failed dashboard read never blocks Admin's actual
 * workflow — the error Banner sits above a fully usable menu.
 *
 * Two frame slots have no counterpart in the app. The headline above the role
 * line is the centre's name, which no endpoint and no doc supplies, so the
 * line is left out rather than filled with substitute copy. The TopBar
 * trailing slot holds a bell — there is no notification screen among UF's 35 —
 * so, as on SCR-17, it carries the SCR-34 Profile entry point that UF §26
 * requires from every role's home.
 */
export function AdminStack() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { data, isLoading, isError, error, refetch } =
    useDashboard<AdminDashboardDto>();

  const openGroups = () => router.push('/(app)/admin/groups' as any);
  const openUsers = () => router.push('/(app)/admin/users' as any);

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
    <View className="flex-1 bg-canvas dark:bg-canvas-dark" testID="admin-stack">
      <TopBar
        title="الإدارة"
        back={false}
        testID="admin-top-bar"
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
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: 24,
          gap: 14,
        }}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text
          className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
          testID="admin-role-line"
        >
          {ROLE_LINE}
        </Text>

        {isLoading && !data ? (
          <View className="w-full" testID="admin-summary-loading">
            <SkeletonLoader variant="dashboard" />
          </View>
        ) : (
          <>
            {isError ? (
              <Banner
                tone="error"
                message={describeDashboardError(error)}
                onRetry={() => void refetch()}
                testID="admin-summary-error"
              />
            ) : null}
            <AdminSummaryTiles
              groupCount={data?.group_count ?? null}
              staffCount={data?.staff_count ?? null}
              studentCount={data?.student_count ?? null}
              pendingRecoveryCount={data?.pending_recovery_count ?? null}
              onGroupsPress={openGroups}
              onStaffPress={openUsers}
            />
          </>
        )}

        <View className="w-full gap-2.5 pt-1.5" testID="admin-menu">
          <ListRow
            title="المجموعات"
            subtitle="إنشاء · أرشفة · إسناد الطاقم · القوائم"
            leadingIcon="layers"
            onPress={openGroups}
            testID="admin-groups-button"
          />
          <ListRow
            title="الطاقم والمستخدمون"
            subtitle="ترقية مستخدم إلى معلّم أو مساعد"
            leadingIcon="users"
            onPress={openUsers}
            testID="admin-users-button"
          />
          <ListRow
            title="سجل التدقيق"
            subtitle="تسجيل الدخول · إنشاء مجموعة · تبديل التسجيل"
            leadingIcon="file-text"
            onPress={() => router.push('/(app)/admin/audit' as any)}
            testID="admin-audit-button"
          />
        </View>

        <View className="w-full mt-auto pt-4">
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
