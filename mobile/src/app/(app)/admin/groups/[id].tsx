import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { GroupDetailScreen } from '@/features/groups/screens/GroupDetailScreen';

export default function AdminGroupDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <GroupDetailScreen groupId={id || ''} />;
}
