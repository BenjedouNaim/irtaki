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

  it('offers Report History and routes it to SCR-14 (UF §26 Progress tab → History)', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: true });

    renderTabs();

    fireEvent.press(await screen.findByTestId('report-history-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/student/reports/history');
  });

  it('routes "View Today\'s Report" to SCR-15 by the id of the report already fetched (F-DR-07)', async () => {
    jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockResolvedValue({
      can_submit: false,
      block_reason: 'already_submitted',
      existing_report: {
        id: 'report-today',
        report_date: '2026-09-02',
        type: 'Absent',
        submitted_at: '2026-09-02T08:30:00.000Z',
        submitted_timezone: 'Africa/Tunis',
        no_memorization_today: null,
        memo_range: null,
        memo_time: null,
        completed_50_repetitions: null,
        repetitions_in_single_session: null,
        no_revision_today: null,
        rev_range: null,
        rev_time: null,
        read_tafsir: null,
        absence_reason: 'Sick',
      },
    });

    renderTabs();

    fireEvent.press(await screen.findByTestId('view-report-button'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/student/reports/[id]',
      params: { id: 'report-today' },
    });
    expect(dailyReportsApi.getTodayReportStatus).toHaveBeenCalledTimes(1);
  });

  it('routes "Complete Weekly Report" to SCR-12 on the recitation day (UF §10, F-WR-01)', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: false, block_reason: 'recitation_day' });

    renderTabs();

    fireEvent.press(await screen.findByTestId('weekly-report-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/student/weekly-report');
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
  });
});
