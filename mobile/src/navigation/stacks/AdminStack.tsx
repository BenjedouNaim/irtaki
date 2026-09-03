import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar, Button, Icon, ListRow } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { logoutUser } from '@/shared/api/auth.client';
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
 * (F-ADM-03). The tiles read `GET /me/dashboard` (API-009), which has no
 * client yet, so they render MetricTile's Null state (see AdminSummaryTiles);
 * the group and staff tiles still carry UF §10's tap targets.
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

        <AdminSummaryTiles
          onGroupsPress={openGroups}
          onStaffPress={openUsers}
        />

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
