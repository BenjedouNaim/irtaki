import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StudentTabs } from '../StudentTabs';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';

jest.mock('@/shared/api/dailyReports.client');
jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

let queryClient: QueryClient;

function renderTabs() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentTabs />
    </QueryClientProvider>,
  );
}

describe('StudentTabs (SCR-08 stub + Daily Report CTA, F-DR-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders the report status card and routes "Submit Today\'s Report" to SCR-09 (UF §26)', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: true });

    renderTabs();

    expect(screen.getByTestId('student-tabs')).toBeTruthy();
    fireEvent.press(await screen.findByTestId('submit-report-button'));
    expect(mockPush).toHaveBeenCalledWith(
      '/(app)/student/daily-report/type-selection',
    );
  });

  it('keeps the profile entry point', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: false, block_reason: 'group_archived' });

    renderTabs();

    expect(await screen.findByTestId('report-status-card-banner')).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
