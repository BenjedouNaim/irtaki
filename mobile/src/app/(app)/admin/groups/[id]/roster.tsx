import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RosterScreen from '@/features/membership/screens/RosterScreen';

export default function AdminGroupRosterRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <RosterScreen groupId={id || ''} />;
}
