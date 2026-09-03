import React from 'react';
import { render as rtlRender, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RootNavigator } from '../RootNavigator';
import { useAuthStore } from '../../shared/auth/authStore';

// StudentTabs hosts the Daily Report CTA card (F-DR-01), which reads API-029
// through TanStack Query — RootLayout provides the QueryClient in the app.
jest.mock('@/shared/api/dailyReports.client');

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('RootNavigator', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders AuthStack when unauthenticated', async () => {
    await render(<RootNavigator />);
    expect(screen.getByTestId('auth-stack')).toBeTruthy();
  });

  it('renders UserStack when role is User', async () => {
    useAuthStore.getState().setSession('token', 'User');
    await render(<RootNavigator />);
    expect(screen.getByTestId('user-stack')).toBeTruthy();
  });

  it('renders StudentTabs when role is Student', async () => {
    useAuthStore.getState().setSession('token', 'Student');
    await render(<RootNavigator />);
    expect(screen.getByTestId('student-tabs')).toBeTruthy();
  });

  it('renders AssistantTabs when role is Assistant', async () => {
    useAuthStore.getState().setSession('token', 'Assistant');
    await render(<RootNavigator />);
    expect(screen.getByTestId('assistant-tabs')).toBeTruthy();
  });

  it('renders TeacherStack when role is Teacher', async () => {
    useAuthStore.getState().setSession('token', 'Teacher');
    await render(<RootNavigator />);
    expect(screen.getByTestId('teacher-stack')).toBeTruthy();
  });

  it('renders AdminStack when role is Admin', async () => {
    useAuthStore.getState().setSession('token', 'Admin');
    await render(<RootNavigator />);
    expect(screen.getByTestId('admin-stack')).toBeTruthy();
  });
});
