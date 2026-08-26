import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RecoveryScreen from '@/features/membership/screens/RecoveryScreen';

export default function AdminMembershipRecoveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <RecoveryScreen membershipId={id || ''} />;
}
