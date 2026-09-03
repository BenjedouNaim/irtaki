import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';

export default function LoginPage() {
  const router = useRouter();
  const { resetSuccess } = useLocalSearchParams<{ resetSuccess?: string }>();

  const handleLoginSuccess = (role: string) => {
    switch (role) {
      case 'User':
        router.replace('/(app)/user');
        break;
      case 'Student':
        router.replace('/(app)/student');
        break;
      case 'Assistant':
        router.replace('/(app)/assistant');
        break;
      case 'Teacher':
        router.replace('/(app)/teacher');
        break;
      case 'Admin':
        router.replace('/(app)/admin');
        break;
      default:
        router.replace('/(app)/user');
    }
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
