import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DailyReportHistoryList } from '../DailyReportHistoryList';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/dailyReports.client');

const NEVER = () => new Promise<never>(() => {});
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل سجل التقارير';

function report(
  id: string,
  report_date: string,
): dailyReportsApi.DailyReportDto {
  return {
    id,
    report_date,
    type: 'Absent',
    submitted_at: `${report_date}T08:30:00.000Z`,
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
  };
}

const page1: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [report('r3', '2026-08-03'), report('r2', '2026-08-02')],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const page2: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [report('r1', '2026-08-01')],
  pagination: { next_cursor: null, has_more: false },
};
const emptyPage: dailyReportsApi.ListOwnDailyReportsResponse = {
  data: [],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderList(
  props: React.ComponentProps<typeof DailyReportHistoryList> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyReportHistoryList {...props} />
    </QueryClientProvider>,
  );
}

describe('DailyReportHistoryList (SCR-14 Daily sub-tab, F-DR-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders skeleton rows on first load (UF §22)', () => {
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockImplementation(NEVER);

    renderList();

    expect(screen.getByTestId('daily-report-history-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-report-row-0')).toBeTruthy();
    expect(screen.queryByTestId('daily-report-history-list')).toBeNull();
  });

  it('renders the rows in server order and opens a tapped row', async () => {
    jest.spyOn(dailyReportsApi, 'listOwnDailyReports').mockResolvedValue(page2);
    const onOpenReport = jest.fn();

    renderList({ onOpenReport });

    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenCalledWith({
      limit: 20,
    });

    fireEvent.press(screen.getByTestId('daily-report-row-r1'));
    expect(onOpenReport).toHaveBeenCalledWith(page2.data[0]);
  });

  it('loads the next page with the cursor when the end is reached, showing the inline spinner meanwhile (UF §22)', async () => {
    let resolveNext: (
      page: dailyReportsApi.ListOwnDailyReportsResponse,
    ) => void = () => {};
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockResolvedValueOnce(page1)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = resolve;
          }),
      );

    renderList();

    const list = await screen.findByTestId('daily-report-history-list');
    expect(screen.getByTestId('daily-report-row-r3')).toBeTruthy();
    expect(screen.getByTestId('daily-report-row-r2')).toBeTruthy();

    fireEvent(list, 'onEndReached');

    expect(
      await screen.findByTestId('daily-report-history-loading-more'),
    ).toBeTruthy();
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });

    resolveNext(page2);

    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(
      screen.queryByTestId('daily-report-history-loading-more'),
    ).toBeNull();

    // Last page reached: another end-reached must not fetch again.
    fireEvent(list, 'onEndReached');
    expect(dailyReportsApi.listOwnDailyReports).toHaveBeenCalledTimes(2);
  });

  it('renders "No reports yet" for an empty history (UF §23)', async () => {
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockResolvedValue(emptyPage);

    renderList();

    expect(
      await screen.findByTestId('daily-report-history-empty'),
    ).toBeTruthy();
    expect(screen.getByText('لا توجد تقارير بعد')).toBeTruthy();
    expect(screen.queryByTestId('daily-report-history-list')).toBeNull();
  });

  it.each([500, 503])(
    'shows the generic retry banner on a %i, never the server string, and retries (UF §24)',
    async (statusCode) => {
      const serverMessage = 'FATAL: relation "daily_reports" does not exist';
      const spy = jest
        .spyOn(dailyReportsApi, 'listOwnDailyReports')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode,
            error: 'INTERNAL_ERROR',
            message: serverMessage,
          }),
        )
        .mockResolvedValueOnce(page2);

      renderList();

      const banner = await screen.findByTestId('daily-report-history-error');
      expect(banner.props.accessibilityRole).toBe('alert');
      expect(screen.getByLabelText('تنبيه')).toBeTruthy();
      expect(
        screen.getByTestId('daily-report-history-error-message').props.children,
      ).toBe(GENERIC_SERVER_MESSAGE);
      expect(screen.queryByText(/relation/)).toBeNull();

      fireEvent.press(
        screen.getByTestId('daily-report-history-error-retry-button'),
      );

      expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    },
  );

  it('shows the filter Arabic message verbatim on a 4xx', async () => {
    jest.spyOn(dailyReportsApi, 'listOwnDailyReports').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderList();

    expect(
      await screen.findByTestId('daily-report-history-error'),
    ).toBeTruthy();
    expect(
      screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
    ).toBeTruthy();
  });

  it('shows the shared connectivity copy on a network failure', async () => {
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
      .mockRejectedValue(new NetworkError('Network request failed'));

    renderList();

    expect(
      await screen.findByTestId('daily-report-history-error'),
    ).toBeTruthy();
    expect(screen.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });

  it('appends a retry banner below the loaded rows when a next page fails, keeping the rows', async () => {
    jest
      .spyOn(dailyReportsApi, 'listOwnDailyReports')
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
    const list = await screen.findByTestId('daily-report-history-list');

    fireEvent(list, 'onEndReached');

    expect(
      await screen.findByTestId('daily-report-history-page-error'),
    ).toBeTruthy();
    expect(screen.getByTestId('daily-report-row-r3')).toBeTruthy();
    expect(screen.queryByTestId('daily-report-history-error')).toBeNull();

    fireEvent.press(
      screen.getByTestId('daily-report-history-page-error-retry-button'),
    );

    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(screen.queryByTestId('daily-report-history-page-error')).toBeNull();
  });

  it('reads API-032 for the given membership — and never API-031 — under the caller-chosen testID (SCR-25 reuse, F-DR-06)', async () => {
    jest
      .spyOn(dailyReportsApi, 'listMembershipDailyReports')
      .mockResolvedValueOnce(page1)
      .mockResolvedValueOnce(page2);
    const onOpenReport = jest.fn();

    renderList({
      membershipId: 'membership-1',
      onOpenReport,
      testID: 'raw-daily-reports',
    });

    const list = await screen.findByTestId('raw-daily-reports-list');
    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenCalledWith(
      'membership-1',
      { limit: 20 },
    );
    expect(dailyReportsApi.listOwnDailyReports).not.toHaveBeenCalled();

    fireEvent(list, 'onEndReached');
    expect(await screen.findByTestId('daily-report-row-r1')).toBeTruthy();
    expect(dailyReportsApi.listMembershipDailyReports).toHaveBeenLastCalledWith(
      'membership-1',
      {
        limit: 20,
        cursor: 'cursor-2',
      },
    );

    fireEvent.press(screen.getByTestId('daily-report-row-r3'));
    expect(onOpenReport).toHaveBeenCalledWith(page1.data[0]);
  });

  it('shows the filter Arabic message verbatim on the uniform 403 of an out-of-scope membership (UF §24)', async () => {
    jest.spyOn(dailyReportsApi, 'listMembershipDailyReports').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderList({ membershipId: 'membership-1', testID: 'raw-daily-reports' });

    expect(await screen.findByTestId('raw-daily-reports-error')).toBeTruthy();
    expect(
      screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
    ).toBeTruthy();
    expect(screen.queryByTestId('raw-daily-reports-list')).toBeNull();
  });
});
