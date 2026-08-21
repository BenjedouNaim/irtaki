import React, { useState } from 'react';
import { View, Text } from 'react-native';
import { Button } from '@/shared/components/Button';
import { logoutUser } from '@/shared/api/auth.client';
import {
  useAuthStore,
  getStoredRefreshToken,
  deleteStoredRefreshToken,
} from '@/shared/auth/authStore';

export function AssistantTabs() {
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
    <View
      className="flex-1 items-center justify-center p-4 bg-white dark:bg-gray-950"
      testID="assistant-tabs"
    >
      <Text className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2 text-center">
        شاشة المساعد (التقارير · الحضور · الطلاب)
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Assistant Tabs Stub
      </Text>
      <Button
        label="تسجيل الخروج"
        variant="destructive"
        loading={isLoggingOut}
        onPress={handleLogout}
        testID="logout-button"
      />
    </View>
  );
}
