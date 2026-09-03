import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeeklyReportHistoryList } from '../WeeklyReportHistoryList';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/weeklyReports.client');

const NEVER = () => new Promise<never>(() => {});
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل سجل التقارير';

function report(
  id: string,
  week_start: string,
): weeklyReportsApi.WeeklyReportDto {
  return {
    id,
    week_start,
    week_end: week_start,
    expected_days: 6,
    missed_daily_reports: 1,
    missed_daily_memorization: 2,
    missed_daily_revision: 3,
    missed_50_repetitions: 4,
    missed_single_session: 5,
    attended_recitation_call: false,
    state: 'Finalised',
    finalised_at: `${week_start}T09:00:00.000Z`,
    finalised_by: 'Scheduler',
  };
}

const page1: weeklyReportsApi.WeeklyReportListResponse = {
  data: [report('w3', '2026-08-15'), report('w2', '2026-08-08')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: weeklyReportsApi.WeeklyReportListResponse = {
  data: [report('w1', '2026-08-01')],
  pagination: { next_cursor: null, has_more: false },
};
const emptyPage: weeklyReportsApi.WeeklyReportListResponse = {
  data: [],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderList(
  props: React.ComponentProps<typeof WeeklyReportHistoryList> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WeeklyReportHistoryList {...props} />
    </QueryClientProvider>,
  );
}

describe('WeeklyReportHistoryList (SCR-14 Weekly sub-tab, F-WR-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders skeleton rows on first load (UF §22)', () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockImplementation(NEVER);

    renderList();

    expect(screen.getByTestId('weekly-report-history-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-report-row-0')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-history-list')).toBeNull();
  });

  it('renders the rows in server order and opens a tapped row', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValue(page2);
    const onOpenReport = jest.fn();

    renderList({ onOpenReport });

    expect(await screen.findByTestId('weekly-report-row-w1')).toBeTruthy();
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenCalledWith({
      limit: 20,
    });

    fireEvent.press(screen.getByTestId('weekly-report-row-w1'));
    expect(onOpenReport).toHaveBeenCalledWith(page2.data[0]);
  });

  it('loads the next page with the cursor when the end is reached, showing the inline spinner meanwhile (UF §22)', async () => {
    let resolveNext: (
      page: weeklyReportsApi.WeeklyReportListResponse,
    ) => void = () => {};
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValueOnce(page1)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = resolve;
          }),
      );

    renderList();

    const list = await screen.findByTestId('weekly-report-history-list');
    expect(screen.getByTestId('weekly-report-row-w3')).toBeTruthy();
    expect(screen.getByTestId('weekly-report-row-w2')).toBeTruthy();

    fireEvent(list, 'onEndReached');

    expect(
      await screen.findByTestId('weekly-report-history-loading-more'),
    ).toBeTruthy();
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });

    resolveNext(page2);

    expect(await screen.findByTestId('weekly-report-row-w1')).toBeTruthy();
    expect(
      screen.queryByTestId('weekly-report-history-loading-more'),
    ).toBeNull();

    // Last page reached: another end-reached must not fetch again.
    fireEvent(list, 'onEndReached');
    expect(weeklyReportsApi.listOwnWeeklyReports).toHaveBeenCalledTimes(2);
  });

  it('renders "No weekly reports yet" for an empty history (UF §23)', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValue(emptyPage);

    renderList();

    expect(
      await screen.findByTestId('weekly-report-history-empty'),
    ).toBeTruthy();
    expect(screen.getByText('لا توجد تقارير أسبوعية بعد')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-history-list')).toBeNull();
  });

  it.each([500, 503])(
    'shows the generic retry banner on a %i, never the server string, and retries (UF §24)',
    async (statusCode) => {
      const serverMessage = 'FATAL: relation "weekly_reports" does not exist';
      const spy = jest
        .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode,
            error: 'INTERNAL_ERROR',
            message: serverMessage,
          }),
        )
        .mockResolvedValueOnce(page2);

      renderList();

      const banner = await screen.findByTestId('weekly-report-history-error');
      expect(banner.props.accessibilityRole).toBe('alert');
      expect(screen.getByLabelText('تنبيه')).toBeTruthy();
      expect(
        screen.getByTestId('weekly-report-history-error-message').props
          .children,
      ).toBe(GENERIC_SERVER_MESSAGE);
      expect(screen.queryByText(/relation/)).toBeNull();

      fireEvent.press(
        screen.getByTestId('weekly-report-history-error-retry-button'),
      );

      expect(await screen.findByTestId('weekly-report-row-w1')).toBeTruthy();
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    },
  );

  it('shows the filter Arabic message verbatim on a 4xx', async () => {
    jest.spyOn(weeklyReportsApi, 'listOwnWeeklyReports').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderList();

    expect(
      await screen.findByTestId('weekly-report-history-error'),
    ).toBeTruthy();
    expect(
      screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
    ).toBeTruthy();
  });

  it('shows the shared connectivity copy on a network failure', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockRejectedValue(new NetworkError('Network request failed'));

    renderList();

    expect(
      await screen.findByTestId('weekly-report-history-error'),
    ).toBeTruthy();
    expect(screen.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('appends a retry banner below the loaded rows when a next page fails, keeping the rows', async () => {
    jest
      .spyOn(weeklyReportsApi, 'listOwnWeeklyReports')
      .mockResolvedValueOnce(page1)
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'boom',
        }),
      )
      .mockResolvedValueOnce(page2);

    renderList();
    const list = await screen.findByTestId('weekly-report-history-list');

    fireEvent(list, 'onEndReached');

    expect(
      await screen.findByTestId('weekly-report-history-page-error'),
    ).toBeTruthy();
    expect(screen.getByTestId('weekly-report-row-w3')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-history-error')).toBeNull();

    fireEvent.press(
      screen.getByTestId('weekly-report-history-page-error-retry-button'),
    );

    expect(await screen.findByTestId('weekly-report-row-w1')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-history-page-error')).toBeNull();
  });
});
