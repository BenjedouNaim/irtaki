import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/shared/auth';
import { useThemeColors } from '@/shared/theme/colors';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  if (isAuthenticated && role) {
    switch (role) {
      case 'User':
        return <Redirect href="/(app)/user" />;
      case 'Student':
        return <Redirect href="/(app)/student" />;
      case 'Assistant':
        return <Redirect href="/(app)/assistant" />;
      case 'Teacher':
        return <Redirect href="/(app)/teacher" />;
      case 'Admin':
        return <Redirect href="/(app)/admin" />;
      default:
        return <Redirect href="/(app)/user" />;
    }
  }

  // Headers are hidden (the auth screens draw their own TopBar, UF §31), so
  // pad every screen below the status bar / notch and paint the canvas
  // token behind the stack so transitions never flash a white ground.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          paddingTop: insets.top,
          backgroundColor: colors.bgCanvas,
        },
      }}
    />
  );
}
