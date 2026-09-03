import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeRouteForRole } from '@/navigation/roleHome';
import { useAuthStore } from '@/shared/auth';
import { useThemeColors } from '@/shared/theme/colors';

export default function AuthLayout() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  // An authenticated caller has no business on an auth screen: bounce them
  // to their own Home through F-DASH-02's single role→route map, so this
  // layout can never disagree with the entry route about where a role lives.
  if (isAuthenticated && role) {
    return <Redirect href={homeRouteForRole(role)} />;
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
