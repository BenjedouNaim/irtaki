import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/shared/auth';

export default function AppLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  // Headers are hidden (UF §31 screens draw their own back control), so the
  // native stack applies no top inset itself. Pad every authenticated screen's
  // content below the status bar / notch on both platforms; scroll views that
  // use contentInsetAdjustmentBehavior="automatic" see no overlap afterwards
  // and therefore add nothing on top of this.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { paddingTop: insets.top },
      }}
    />
  );
}
