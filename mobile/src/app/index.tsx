import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/shared/auth';

export default function Index() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);

  if (!isAuthenticated || !role) {
    return <Redirect href="/(auth)/login" />;
  }

  switch (role) {
    case 'User':
      return <Redirect href="/(app)/user" />;
    case 'Student':
      return <Redirect href="/(app)/student" />;
    case 'Assistant':
      return <Redirect href="/(app)/assistant" />;
    case 'Teacher':
      return <Redirect href="/(app)/teacher" />;
    case 'Admin':
      return <Redirect href="/(app)/admin" />;
    default:
      return <Redirect href="/(auth)/login" />;
  }
}
