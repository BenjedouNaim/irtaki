import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RosterScreen from '@/features/membership/screens/RosterScreen';

/** SCR-30 Roster · Admin; the group name rides along from SCR-29. */
export default function AdminGroupRosterRoute() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  return <RosterScreen groupId={id || ''} groupName={name || null} />;
}
