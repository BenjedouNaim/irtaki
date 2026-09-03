import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RawDailyReportsScreen } from '../RawDailyReportsScreen';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError } from '@/shared/api/types';

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

const MEMBERSHIP_ID = '01912f4e-6c1a-7b3c-9d5e-1f2a3b4c5d6e';

const onePage: dailyReportsApi.DailyReportListResponse = {
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
const emptyPage: dailyReportsApi.DailyReportListResponse = {
  data: [],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderScreen(
  props: Partial<React.ComponentProps<typeof RawDailyReportsScreen>> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RawDailyReportsScreen membershipId={MEMBERSHIP_ID} {...props} />
    </QueryClientProvider>,
  );
}

describe('RawDailyReportsScreen (SCR-25, Figma 38:297, F-DR-06)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValue(onePage);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('names the screen after the student, heads the read-only list and feeds it from API-032', async () => {
    renderScreen({ studentName: 'محمد بن علي' });

    expect(
      screen.getByTestId('raw-daily-reports-top-bar-title').props.children,
    ).toBe('تقارير محمد بن علي');
    expect(screen.getByTestId('raw-daily-reports-title').props.children).toBe(
      'التقارير اليومية',
    );
    expect(screen.getByText('للقراءة فقط')).toBeTruthy();
    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenCalledWith(
      MEMBERSHIP_ID,
      { limit: 20 },
    );
    expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();
    // UF §15: no date-range filter control; no Daily/Weekly control either —
    // no staff weekly-report screen exists to switch to.
    expect(screen.queryByTestId('report-history-tabs')).toBeNull();
    expect(screen.queryByTestId('segmented-control')).toBeNull();
  });

  it('falls back to the generic title when no name is known', async () => {
    renderScreen();

    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(
      screen.getByTestId('raw-daily-reports-top-bar-title').props.children,
    ).toBe('التقارير اليومية');
  });

  it('hands a tapped row to onOpenReport (→ SCR-15 from the cached row, F-DR-07)', async () => {
    const onOpenReport = jest.fn();
    renderScreen({ onOpenReport });

    fireEvent.press(await screen.findByTestId('daily-report-row-r1'));

    expect(onOpenReport).toHaveBeenCalledWith(onePage.data[0]);
  });

  it('shows skeleton rows first, then the UF §23 empty state', async () => {
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValue(emptyPage);

    renderScreen();

    expect(screen.getByTestId('raw-daily-reports-skeleton')).toBeTruthy();
    expect(await screen.findByTestId('raw-daily-reports-empty')).toBeTruthy();
    expect(screen.getByText('لا توجد تقارير بعد')).toBeTruthy();
  });

  it('shows the uniform 403 message with the alert icon, never colour-only (UF §24, §32)', async () => {
    jest.spyOn(dailyReportsApi, 'listMembershipDailyReports').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderScreen();

    const banner = await screen.findByTestId('raw-daily-reports-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(
      screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
    ).toBeTruthy();
  });

  it('goes back from the top-right control, falling back to Teacher Home without history (UF §31)', () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('raw-daily-reports-top-bar-back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockCanGoBack.mockReturnValue(false);
    fireEvent.press(screen.getByTestId('raw-daily-reports-top-bar-back'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/teacher');
  });
});
