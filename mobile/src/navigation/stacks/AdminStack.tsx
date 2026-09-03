import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { TopBar, Button, ListRow } from '@/shared/components';
import { typography } from '@/shared/theme/typography';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

/**
 * SCR-26 Admin Home (Figma 39:2, UF §10 "Menu hub"). The four MetricTiles
 * of the frame (staff, groups, pending recoveries, students) are dashboard
 * aggregates the app does not fetch yet, and the Audit Log row leads to a
 * screen that does not exist yet — both are left out rather than faked
 * (UF §8: never offer an out-of-scope screen).
 */
export function AdminStack() {
  const router = useRouter();
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

  return (
    <View className="flex-1 bg-canvas dark:bg-canvas-dark" testID="admin-stack">
      <TopBar title="الإدارة" back={false} testID="admin-top-bar" />
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
          testID="admin-greeting"
        >
          مدير · قراءة كاملة، وإعدادات هيكلية فقط
        </Text>

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
            title="الملف الشخصي"
            leadingIcon="user"
            onPress={() => router.push('/(app)/profile')}
            testID="profile-button"
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
