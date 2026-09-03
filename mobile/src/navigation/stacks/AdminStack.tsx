import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar, Button, Icon, ListRow } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { itemsStart } from '@/shared/theme/rtl';
import { logoutUser } from '@/shared/api/auth.client';
import { useMe } from '@/features/dashboard/hooks/useMe';
import { AdminSummaryTiles } from '@/features/admin/components/AdminSummaryTiles';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

/** Figma 39:35 — the role line under the greeting. */
const ROLE_LINE = 'مدير · قراءة كاملة، وإعدادات هيكلية فقط';

function firstName(fullName: string | null | undefined): string | null {
  const trimmed = fullName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

/**
 * SCR-26 Admin Home (Figma 39:2, UF §10 / §28 "Menu hub"): a greeting, the
 * four dashboard tiles and the three menu rows that are Admin's real
 * workflow — Groups (F-GRP-10), Staff & Users (F-ADM-02) and the Audit Log
 * (F-ADM-03). Nothing here aggregates cross-module data; the tiles read
 * `GET /me/dashboard` (API-009), which has no client yet, so they render
 * MetricTile's Null state (see AdminSummaryTiles).
 *
 * The frame's greeting headline is the centre's name, which no endpoint
 * exposes; the caller's own name from `GET /me` fills that line instead, as
 * on SCR-17. The frame's TopBar trailing slot holds a bell — there is no
 * notification screen in UF's 35 — so, as on SCR-17, the slot carries the
 * SCR-34 Profile entry point.
 */
export function AdminStack() {
  const router = useRouter();
  const me = useMe();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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

  const name = firstName(me.data?.full_name);

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
        <View className={`w-full gap-0.5 ${itemsStart}`}>
          <Text
            className={`w-full ${typography.headingLg} text-right text-fg dark:text-fg-dark`}
            accessibilityRole="header"
            numberOfLines={1}
            testID="admin-greeting"
          >
            {name ? `مرحبًا، ${name}` : 'مرحبًا'}
          </Text>
          <Text
            className={`w-full ${typography.bodySm} text-right text-fg-secondary dark:text-fg-secondary-dark`}
            testID="admin-role-line"
          >
            {ROLE_LINE}
          </Text>
        </View>

        <AdminSummaryTiles />

        <View className="w-full gap-2.5 pt-1.5" testID="admin-menu">
          <ListRow
            title="المجموعات"
            subtitle="إنشاء · أرشفة · إسناد الطاقم · القوائم"
            leadingIcon="layers"
            onPress={() => router.push('/(app)/admin/groups' as any)}
            testID="admin-groups-button"
          />
          <ListRow
            title="الطاقم والمستخدمون"
            subtitle="ترقية مستخدم إلى معلّم أو مساعد"
            leadingIcon="users"
            onPress={() => router.push('/(app)/admin/users' as any)}
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
