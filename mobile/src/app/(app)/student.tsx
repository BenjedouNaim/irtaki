import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StudentTabs } from '@/navigation/stacks/StudentTabs';

export default function StudentRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return <StudentTabs notificationTab={tab} />;
}
