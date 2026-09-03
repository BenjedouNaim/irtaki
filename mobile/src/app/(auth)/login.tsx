import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';
import { homeRouteForRole } from '@/navigation/roleHome';
import type { Role } from '@/shared/auth';

export default function LoginPage() {
  const router = useRouter();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();

  /**
   * "Every role lands on its correct Home screen immediately post-login"
   * (F-DASH-02) — resolved from the role the session was just opened with,
   * through the same map the entry route uses. `replace`, not `push`: the
   * login screen must not stay on the back stack behind a Home (UF §8).
   */
  const handleLoginSuccess = (role: string) => {
    router.replace(homeRouteForRole(role as Role));
  };

  return (
    <LoginScreen
      onNavigateToRegister={() => router.push('/(auth)/register')}
      onNavigateToForgotPassword={() =>
        router.push('/(auth)/forgot-password-request')
      }
      onLoginSuccess={handleLoginSuccess}
      successMessage={
        resetSuccess === 'true' ? 'تم تغيير كلمة المرور بنجاح' : undefined
      }
    />
  );
}
