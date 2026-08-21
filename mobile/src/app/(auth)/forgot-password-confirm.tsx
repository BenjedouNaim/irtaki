import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ForgotPasswordConfirmScreen } from '@/features/auth/screens/ForgotPasswordConfirmScreen';

export default function ForgotPasswordConfirmPage() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  return (
    <ForgotPasswordConfirmScreen
      token={token}
      onSuccess={() => router.replace('/(auth)/login?resetSuccess=true')}
      onNavigateToRequest={() =>
        router.replace('/(auth)/forgot-password-request')
      }
    />
  );
}
