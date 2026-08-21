import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';

export default function LoginPage() {
  const router = useRouter();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();

  return (
    <LoginScreen
      onNavigateToRegister={() => router.push('/(auth)/register')}
      onNavigateToForgotPassword={() =>
        router.push('/(auth)/forgot-password-request')
      }
      successMessage={
        resetSuccess === 'true'
          ? 'تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.'
          : undefined
      }
    />
  );
}
