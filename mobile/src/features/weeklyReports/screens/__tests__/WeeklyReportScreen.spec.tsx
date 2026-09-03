import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeeklyReportScreen } from '../WeeklyReportScreen';
import * as weeklyReportsApi from '@/shared/api/weeklyReports.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/weeklyReports.client');

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

const liveReport: weeklyReportsApi.WeeklyReportLiveDto = {
  id: null,
  week_start: '2026-08-29',
  week_end: '2026-09-04',
  expected_days: 5,
  missed_daily_reports: 3,
  missed_daily_memorization: 3,
  missed_daily_revision: 4,
  missed_50_repetitions: 1,
  missed_single_session: 0,
  attended_recitation_call: false,
  state: 'Open',
  can_confirm: false,
};

const openRow: weeklyReportsApi.WeeklyReportLiveDto = {
  ...liveReport,
  id: 'weekly-1',
  expected_days: 6,
  missed_daily_reports: 6,
  missed_daily_memorization: 6,
  missed_daily_revision: 6,
  missed_50_repetitions: 0,
  missed_single_session: 0,
  can_confirm: true,
};

let queryClient: QueryClient;

function renderScreen(
  props: React.ComponentProps<typeof WeeklyReportScreen> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WeeklyReportScreen {...props} />
    </QueryClientProvider>,
  );
}

function mockReport(report: weeklyReportsApi.WeeklyReportLiveDto) {
  jest
    .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
    .mockResolvedValue(report);
}

describe('WeeklyReportScreen (SCR-12, F-WR-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('shows a metric-row skeleton while loading (UF §22)', () => {
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockReturnValue(new Promise(() => {}));

    renderScreen();

    expect(screen.getByTestId('weekly-report-skeleton')).toBeTruthy();
    expect(screen.getByTestId('skeleton-metric-row-5')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-content')).toBeNull();
  });

  it('renders the header with the week range and the six metric rows from API-033 (UF §16)', async () => {
    mockReport(liveReport);

    renderScreen();

    expect(await screen.findByTestId('weekly-report-content')).toBeTruthy();
    expect(weeklyReportsApi.getCurrentWeeklyReport).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('weekly-report-title').props.children).toBe(
      'التقرير الأسبوعي',
    );
    expect(screen.getByTestId('weekly-report-week-range').props.children).toBe(
      'من 2026-08-29 إلى 2026-09-04',
    );
    const rows: Array<[string, string]> = [
      ['metric-expected-days', '5'],
      ['metric-missed-daily-reports', '3'],
      ['metric-missed-daily-memorization', '3'],
      ['metric-missed-daily-revision', '4'],
      ['metric-missed-50-repetitions', '1'],
      ['metric-missed-single-session', '0'],
    ];
    for (const [testID, value] of rows) {
      expect(screen.getByTestId(`${testID}-value`).props.children).toBe(value);
    }
    expect(screen.getByTestId('metric-expected-days-hint')).toBeTruthy();
  });

  it('before the recitation day (id null, can_confirm false): read-only, no gate, no CTA, live note (UXQ-06)', async () => {
    mockReport(liveReport);

    renderScreen();

    expect(await screen.findByTestId('weekly-report-live-note')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-confirm-section')).toBeNull();
    expect(screen.queryByTestId('attended-toggle')).toBeNull();
    expect(screen.queryByTestId('confirm-weekly-report-button')).toBeNull();
    expect(screen.queryByTestId('weekly-report-finalised-note')).toBeNull();
    expect(screen.getByText('مفتوح')).toBeTruthy();
  });

  it('on the recitation day (can_confirm true): gate with no default, Confirm disabled until answered', async () => {
    mockReport(openRow);
    const onConfirm = jest.fn();

    renderScreen({ onConfirm });

    expect(
      await screen.findByTestId('weekly-report-confirm-section'),
    ).toBeTruthy();
    // A zero-activity week renders fully, every metric at its max (UF §16).
    expect(
      screen.getByTestId('metric-missed-daily-reports-value').props.children,
    ).toBe('6');
    expect(
      screen.getByTestId('attended-toggle-yes').props.accessibilityState
        .selected,
    ).toBe(false);
    expect(
      screen.getByTestId('attended-toggle-no').props.accessibilityState
        .selected,
    ).toBe(false);

    const button = screen.getByTestId('confirm-weekly-report-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('attended-toggle-yes'));
    await waitFor(() =>
      expect(
        screen.getByTestId('confirm-weekly-report-button').props
          .accessibilityState.disabled,
      ).toBe(false),
    );
    fireEvent.press(screen.getByTestId('confirm-weekly-report-button'));
    expect(onConfirm).toHaveBeenCalledWith({
      reportId: 'weekly-1',
      attended: true,
    });
  });

  it('keeps the CTA disabled while the confirm action is not wired (F-WR-02)', async () => {
    mockReport(openRow);

    renderScreen();

    await screen.findByTestId('weekly-report-confirm-section');
    fireEvent.press(screen.getByTestId('attended-toggle-no'));
    await waitFor(() =>
      expect(
        screen.getByTestId('attended-toggle-no').props.accessibilityState
          .selected,
      ).toBe(true),
    );
    expect(
      screen.getByTestId('confirm-weekly-report-button').props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it('locks the gate and spins the button while confirming (UF §16 Submitting)', async () => {
    mockReport(openRow);

    renderScreen({ onConfirm: jest.fn(), confirming: true });

    await screen.findByTestId('weekly-report-confirm-section');
    expect(
      screen.getByTestId('attended-toggle-yes').props.accessibilityState
        .disabled,
    ).toBe(true);
    expect(
      screen.getByTestId('confirm-weekly-report-button').props
        .accessibilityState.disabled,
    ).toBe(true);
  });

  it('renders a Finalised row read-only with a quiet note and the attendance answer (UF §16, EC-24)', async () => {
    mockReport({
      ...openRow,
      state: 'Finalised',
      attended_recitation_call: true,
      can_confirm: false,
    });

    renderScreen({ onConfirm: jest.fn() });

    expect(
      await screen.findByTestId('weekly-report-finalised-note'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-attended-line').props.children,
    ).toBe('حضور جلسة التسميع: نعم');
    expect(screen.getByText('معتمد')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-confirm-section')).toBeNull();
    expect(screen.queryByTestId('weekly-report-live-note')).toBeNull();
  });

  it('shows the generic retry copy for a 5xx, never the server message (UF §24)', async () => {
    jest.spyOn(weeklyReportsApi, 'getCurrentWeeklyReport').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'internal detail',
      }),
    );

    renderScreen();

    expect(await screen.findByTestId('weekly-report-error')).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-error').props.accessibilityRole,
    ).toBe('alert');
    expect(screen.getByTestId('weekly-report-error-icon')).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-error-message').props.children,
    ).toBe('حدث خطأ أثناء تحميل التقرير الأسبوعي');
    expect(screen.queryByText('internal detail')).toBeNull();
  });

  it('shows the filter Arabic message verbatim for a 4xx and refetches on retry', async () => {
    const spy = jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'المورد المطلوب غير موجود',
        }),
      )
      .mockResolvedValueOnce(liveReport);

    renderScreen();

    expect(
      (await screen.findByTestId('weekly-report-error-message')).props.children,
    ).toBe('المورد المطلوب غير موجود');

    fireEvent.press(screen.getByTestId('weekly-report-retry-button'));

    expect(await screen.findByTestId('weekly-report-content')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('shows the network copy when the request never reached the server', async () => {
    jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockRejectedValue(new NetworkError());

    renderScreen();

    expect(
      (await screen.findByTestId('weekly-report-error-message')).props.children,
    ).toBe('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
  });

  it('back control goes back, or to Home when there is no history', async () => {
    mockReport(liveReport);

    renderScreen();
    await screen.findByTestId('weekly-report-content');

    fireEvent.press(screen.getByTestId('weekly-report-back-button'));
    expect(mockBack).toHaveBeenCalledTimes(1);

    mockCanGoBack.mockReturnValue(false);
    fireEvent.press(screen.getByTestId('weekly-report-back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });
});
