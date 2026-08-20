import React from 'react';
import { useRouter } from 'expo-router';
import { LoginScreen } from '@/features/auth/screens/LoginScreen';

export default function LoginPage() {
  const router = useRouter();

  return (
    <LoginScreen onNavigateToRegister={() => router.push('/(auth)/register')} />
  );
}
