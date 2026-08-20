import React from 'react';
import { useRouter } from 'expo-router';
import { RegisterScreen } from '@/features/auth/screens/RegisterScreen';

export default function RegisterPage() {
  const router = useRouter();

  return (
    <RegisterScreen onNavigateToLogin={() => router.push('/(auth)/login')} />
  );
}
