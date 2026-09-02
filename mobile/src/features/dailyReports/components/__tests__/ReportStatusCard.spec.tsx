import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportStatusCard } from '../ReportStatusCard';
import * as dailyReportsApi from '@/shared/api/dailyReports.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/dailyReports.client');

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل حالة تقرير اليوم';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

let queryClient: QueryClient;

function renderCard(props: React.ComponentProps<typeof ReportStatusCard> = {}) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportStatusCard {...props} />
    </QueryClientProvider>,
  );
}

function mockStatus(status: dailyReportsApi.TodayReportStatusDto) {
  jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockResolvedValue(status);
}

describe('ReportStatusCard (SCR-08 Daily Report CTA, F-DR-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders a card-shaped layout skeleton on first load (UF §22)', () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockImplementation(NEVER);

    renderCard();

    expect(screen.getByTestId('report-status-card-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-title')).toBeTruthy();
    expect(screen.getByTestId('skeleton-card-button')).toBeTruthy();
    expect(screen.queryByTestId('report-status-card')).toBeNull();
    expect(screen.queryByTestId('report-status-card-error')).toBeNull();
  });

  it('renders "Submit Today\'s Report" when can_submit=true and opens Report Type Selection on tap', async () => {
    mockStatus({ can_submit: true });
    const onSubmitReport = jest.fn();

    renderCard({ onSubmitReport });

    expect(await screen.findByTestId('report-status-card')).toBeTruthy();
    expect(dailyReportsApi.getTodayReportStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByText('لم يُرسل تقرير اليوم بعد')).toBeTruthy();
    expect(screen.getByText('إرسال تقرير اليوم')).toBeTruthy();

    fireEvent.press(screen.getByTestId('submit-report-button'));
    expect(onSubmitReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('view-report-button')).toBeNull();
    expect(screen.queryByTestId('weekly-report-button')).toBeNull();
  });

  it('renders "View Today\'s Report" with a success badge for already_submitted', async () => {
    mockStatus({
      can_submit: false,
      block_reason: 'already_submitted',
      existing_report: {
        id: 'report-1',
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
    const onViewReport = jest.fn();

    renderCard({ onViewReport });

    expect(await screen.findByTestId('report-status-card')).toBeTruthy();
    expect(screen.getByText('تم الإرسال')).toBeTruthy();
    expect(screen.getByText('تم إرسال تقرير اليوم')).toBeTruthy();
    expect(
      screen.getByText('لا يمكن تعديل التقرير أو حذفه بعد إرساله.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('view-report-button'));
    expect(onViewReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
  });

  it('renders "Complete Weekly Report" for recitation_day and never offers the daily path', async () => {
    mockStatus({ can_submit: false, block_reason: 'recitation_day' });
    const onCompleteWeeklyReport = jest.fn();

    renderCard({ onCompleteWeeklyReport, onSubmitReport: jest.fn() });

    expect(await screen.findByTestId('report-status-card')).toBeTruthy();
    expect(screen.getByText('يوم التسميع')).toBeTruthy();
    expect(screen.getByText('اليوم هو يوم التسميع')).toBeTruthy();

    fireEvent.press(screen.getByTestId('weekly-report-button'));
    expect(onCompleteWeeklyReport).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
  });

  it('renders a no-CTA banner for group_archived — "Your group is no longer active" (UF §10)', async () => {
    mockStatus({ can_submit: false, block_reason: 'group_archived' });

    renderCard({ onSubmitReport: jest.fn() });

    const banner = await screen.findByTestId('report-status-card-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(screen.getByText('حلقتك لم تعد نشطة')).toBeTruthy();
    expect(screen.getByTestId('report-status-card-banner-icon')).toBeTruthy();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByTestId('report-status-card')).toBeNull();
  });

  it('renders a no-CTA banner for membership_inactive (rare-race fallback)', async () => {
    mockStatus({ can_submit: false, block_reason: 'membership_inactive' });

    renderCard({ onSubmitReport: jest.fn() });

    expect(await screen.findByTestId('report-status-card-banner')).toBeTruthy();
    expect(screen.getByText('عضويتك في الحلقة غير نشطة')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('never infers the reason: a blocked payload without block_reason falls back to the safest banner', async () => {
    mockStatus({ can_submit: false } as dailyReportsApi.TodayReportStatusDto);

    renderCard({ onSubmitReport: jest.fn() });

    expect(await screen.findByTestId('report-status-card-banner')).toBeTruthy();
    expect(screen.queryByTestId('submit-report-button')).toBeNull();
  });

  it('renders the CTA disabled when its destination is not wired (no handler)', async () => {
    mockStatus({ can_submit: false, block_reason: 'already_submitted' });

    renderCard();

    const button = await screen.findByTestId('view-report-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
  });

  it.each([500, 503])(
    'shows the generic retry message on a %i and never the server string (UF §24, TS §29)',
    async (statusCode) => {
      const serverMessage = 'FATAL: relation "daily_reports" does not exist';
      jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockRejectedValue(
        new ApiError({
          statusCode,
          error: statusCode === 500 ? 'INTERNAL_ERROR' : 'SERVICE_UNAVAILABLE',
          message: serverMessage,
        }),
      );

      renderCard();

      expect(
        await screen.findByTestId('report-status-card-error'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('report-status-card-error-message').props.children,
      ).toBe(GENERIC_SERVER_MESSAGE);
      expect(screen.queryByText(serverMessage)).toBeNull();
      expect(screen.queryByText(/relation/)).toBeNull();
    },
  );

  it('shows the filter Arabic message verbatim on a 4xx', async () => {
    jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderCard();

    expect(await screen.findByTestId('report-status-card-error')).toBeTruthy();
    expect(
      screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
    ).toBeTruthy();
  });

  it('pairs the error text with an accessible icon — never color-only (UF §32)', async () => {
    jest.spyOn(dailyReportsApi, 'getTodayReportStatus').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'boom',
      }),
    );

    renderCard();

    const banner = await screen.findByTestId('report-status-card-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    const icon = screen.getByTestId('report-status-card-error-icon');
    expect(icon.props.children).toBe('⚠️');
    expect(icon.props.accessibilityLabel).toBe('تنبيه');
  });

  it('retries the fetch when the retry action is pressed', async () => {
    const spy = jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'boom',
        }),
      )
      .mockResolvedValueOnce({ can_submit: true });

    renderCard({ onSubmitReport: jest.fn() });

    await screen.findByTestId('report-status-card-error');
    fireEvent.press(screen.getByTestId('report-status-card-retry-button'));

    expect(await screen.findByTestId('report-status-card')).toBeTruthy();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('renders a generic connectivity message on network failure, with no internal detail', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockRejectedValue(new NetworkError('TypeError: Network request failed'));

    renderCard();

    expect(await screen.findByTestId('report-status-card-error')).toBeTruthy();
    expect(screen.getByText(NETWORK_MESSAGE)).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
  });
});
