import '@/global.css';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  NotoNaskhArabic_400Regular,
  NotoNaskhArabic_700Bold,
} from '@expo-google-fonts/noto-naskh-arabic';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enforceRTL } from '@/shared/config/rtl';

import { refreshAccessToken } from '@/shared/api/client';
import { useAuthStore } from '@/shared/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [authHydrated, setAuthHydrated] = React.useState(false);

  const [fontsLoaded, fontError] = useFonts({
    NotoNaskhArabic_400Regular,
    NotoNaskhArabic_700Bold,
  });

  useEffect(() => {
    enforceRTL();
  }, []);

  useEffect(() => {
    async function restoreSession() {
      try {
        await refreshAccessToken();
      } catch {
        // Not authenticated
      } finally {
        useAuthStore.getState().setLoading(false);
        setAuthHydrated(true);
      }
    }
    void restoreSession();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && authHydrated) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, authHydrated]);

  if ((!fontsLoaded && !fontError) || !authHydrated) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
        >
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
