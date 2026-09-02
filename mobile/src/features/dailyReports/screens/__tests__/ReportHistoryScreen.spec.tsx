import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportHistoryScreen } from '../ReportHistoryScreen';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';

jest.mock('@/shared/api/dailyReports.client');

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: mockCanGoBack,
  }),
}));

const onePage: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [
    {
      id: 'r1',
      report_date: '2026-08-01',
      type: 'Absent',
      submitted_at: '2026-08-01T08:30:00.000Z',
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
  ],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderScreen(
  props: React.ComponentProps<typeof ReportHistoryScreen> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportHistoryScreen {...props} />
    </QueryClientProvider>,
  );
}

describe('ReportHistoryScreen (SCR-14, F-DR-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockResolvedValue(onePage);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('opens on the Daily sub-tab with both tabs present (UF §15 two sub-tabs)', async () => {
    renderScreen();

    expect(screen.getByTestId('report-history-title').props.children).toBe(
      'سجل التقارير',
    );
    expect(
      screen.getByTestId('report-history-tabs').props.accessibilityRole,
    ).toBe('tablist');
    expect(
      screen.getByTestId('report-history-tab-daily').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      screen.getByTestId('report-history-tab-weekly').props.accessibilityState
        .selected,
    ).toBe(false);
    expect(screen.getByTestId('report-history-content-daily')).toBeTruthy();
    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(screen.queryByTestId('weekly-reports-placeholder')).toBeNull();
  });

  it('hands a tapped daily row to onOpenReport (→ SCR-15)', async () => {
    const onOpenReport = jest.fn();
    renderScreen({ onOpenReport });

    fireEvent.press(await screen.findByTestId('daily-report-row-r1'));

    expect(onOpenReport).toHaveBeenCalledWith(onePage.data[0]);
  });

  it('switches to the Weekly sub-tab, which shows the UF §23 weekly empty state until F-WR-03', async () => {
    renderScreen();
    await screen.findByTestId('daily-report-row-r1');

    fireEvent.press(screen.getByTestId('report-history-tab-weekly'));

    expect(
      screen.getByTestId('report-history-tab-weekly').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(screen.getByTestId('report-history-content-weekly')).toBeTruthy();
    expect(screen.getByTestId('weekly-reports-placeholder')).toBeTruthy();
    expect(screen.getByText('لا توجد تقارير أسبوعية بعد')).toBeTruthy();
    expect(screen.queryByTestId('daily-report-row-r1')).toBeNull();
    // The weekly sub-tab never touches the daily endpoint.
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('report-history-tab-daily'));
    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
  });

  it('honours initialTab', () => {
    renderScreen({ initialTab: 'weekly' });
    expect(screen.getByTestId('weekly-reports-placeholder')).toBeTruthy();
  });

  it('goes back from the top-right control (UF §31)', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('report-history-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to Home when there is no history', () => {
    mockCanGoBack.mockReturnValue(false);
    renderScreen();
    fireEvent.press(screen.getByTestId('report-history-back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
    expect(mockBack).not.toHaveBeenCalled();
  });
});
