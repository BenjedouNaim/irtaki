import React from 'react';
import { useRouter } from 'expo-router';
import { ForgotPasswordRequestScreen } from '@/features/auth/screens/ForgotPasswordRequestScreen';

export default function ForgotPasswordRequestPage() {
  const router = useRouter();

  return (
    <ForgotPasswordRequestScreen
      onNavigateToLogin={() => router.push('/(auth)/login')}
    />
  );
}
