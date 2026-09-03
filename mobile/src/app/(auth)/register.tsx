import React from 'react';
import { useRouter } from 'expo-router';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';
import { homeRouteForRole } from '@/navigation/roleHome';

export default function RegisterPage() {
  const router = useRouter();

  return (
    <RegisterScreen
      onNavigateToLogin={() => router.push('/(auth)/login')}
      // Registration always yields `role = User` (API-001), so the
      // destination is fixed — but it is still resolved through
      // F-DASH-02's map rather than spelled out a second time.
      onRegisterSuccess={() => router.replace(homeRouteForRole('User'))}
    />
  );
}
