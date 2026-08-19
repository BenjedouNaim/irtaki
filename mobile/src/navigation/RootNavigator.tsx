import React from 'react';
import { useAuthStore } from '../shared/auth';
import { AuthStack } from './stacks/AuthStack';
import { UserStack } from './stacks/UserStack';
import { StudentTabs } from './stacks/StudentTabs';
import { AssistantTabs } from './stacks/AssistantTabs';
import { TeacherStack } from './stacks/TeacherStack';
import { AdminStack } from './stacks/AdminStack';

export function RootNavigator() {
  const role = useAuthStore((state) => state.role);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated || !role) {
    return <AuthStack />;
  }

  switch (role) {
    case 'User':
      return <UserStack />;
    case 'Student':
      return <StudentTabs />;
    case 'Assistant':
      return <AssistantTabs />;
    case 'Teacher':
      return <TeacherStack />;
    case 'Admin':
      return <AdminStack />;
    default:
      return <AuthStack />;
  }
}
