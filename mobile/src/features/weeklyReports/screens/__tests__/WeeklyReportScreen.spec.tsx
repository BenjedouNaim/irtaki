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
import { CONFIRM_WEEKLY_REPORT_INVALIDATES } from '../../hooks/useConfirmWeeklyReport';

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

const finalisedReport: weeklyReportsApi.WeeklyReportDto = {
  id: 'weekly-1',
  week_start: '2026-08-29',
  week_end: '2026-09-04',
  expected_days: 6,
  missed_daily_reports: 6,
  missed_daily_memorization: 6,
  missed_daily_revision: 6,
  missed_50_repetitions: 0,
  missed_single_session: 0,
  attended_recitation_call: true,
  state: 'Finalised',
  finalised_at: '2026-09-04T09:00:00.000Z',
  finalised_by: 'Student',
};

let queryClient: QueryClient;

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WeeklyReportScreen />
    </QueryClientProvider>,
  );
}

/** Answers the gate and taps Confirm (the CTA is disabled until answered). */
async function answerAndConfirm(answer: 'yes' | 'no') {
  await screen.findByTestId('weekly-report-confirm-section');
  fireEvent.press(screen.getByTestId(`attended-toggle-${answer}`));
  await waitFor(() =>
    expect(
      screen.getByTestId('confirm-weekly-report-button').props
        .accessibilityState.disabled,
    ).toBe(false),
  );
  fireEvent.press(screen.getByTestId('confirm-weekly-report-button'));
}

function mockReport(report: weeklyReportsApi.WeeklyReportLiveDto) {
  jest
    .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
    .mockResolvedValue(report);
}

describe('WeeklyReportScreen (SCR-12, F-WR-01 / F-WR-02)', () => {
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
    const confirmSpy = jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockResolvedValue(finalisedReport);

    renderScreen();

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
    expect(confirmSpy).not.toHaveBeenCalled();

    await answerAndConfirm('yes');

    await waitFor(() =>
      expect(confirmSpy).toHaveBeenCalledWith('weekly-1', {
        attended_recitation_call: true,
      }),
    );
  });

  it('success (200): posts the answer through the hook, invalidates the TS §26 keys and routes to Home (UF §16)', async () => {
    mockReport(openRow);
    jest.spyOn(weeklyReportsApi, 'confirmWeeklyReport').mockResolvedValue({
      ...finalisedReport,
      attended_recitation_call: false,
    });

    renderScreen();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await answerAndConfirm('no');

    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
    );
    expect(weeklyReportsApi.confirmWeeklyReport).toHaveBeenCalledWith(
      'weekly-1',
      { attended_recitation_call: false },
    );
    for (const key of CONFIRM_WEEKLY_REPORT_INVALIDATES) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [...key] });
    }
    expect(screen.queryByTestId('weekly-report-confirm-banner')).toBeNull();
  });

  it('locks the gate and spins the button while confirming (UF §16 Submitting)', async () => {
    mockReport(openRow);
    jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockReturnValue(new Promise(() => {}));

    renderScreen();
    await answerAndConfirm('yes');

    await waitFor(() =>
      expect(
        screen.getByTestId('attended-toggle-yes').props.accessibilityState
          .disabled,
      ).toBe(true),
    );
    expect(
      screen.getByTestId('confirm-weekly-report-button').props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('409 ALREADY_FINALISED: re-reads the finalised row and shows it read-only with a quiet note, no error tone (UF §16)', async () => {
    const getSpy = jest
      .spyOn(weeklyReportsApi, 'getCurrentWeeklyReport')
      .mockResolvedValueOnce(openRow)
      .mockResolvedValue({
        ...openRow,
        state: 'Finalised',
        attended_recitation_call: false,
        can_confirm: false,
      });
    jest.spyOn(weeklyReportsApi, 'confirmWeeklyReport').mockRejectedValue(
      new ApiError({
        statusCode: 409,
        error: 'ALREADY_FINALISED',
        message: 'تم اعتماد هذا التقرير الأسبوعي مسبقاً ولا يمكن تعديله',
      }),
    );

    renderScreen();
    await answerAndConfirm('yes');

    expect(
      await screen.findByTestId('weekly-report-finalised-note'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-already-finalised-note'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-attended-line').props.children,
    ).toBe('حضور جلسة التسميع: لا');
    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('weekly-report-confirm-section')).toBeNull();
    expect(screen.queryByTestId('weekly-report-confirm-banner')).toBeNull();
    expect(
      screen.queryByText(
        'تم اعتماد هذا التقرير الأسبوعي مسبقاً ولا يمكن تعديله',
      ),
    ).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('422 NOT_RECITATION_DAY: generic error with icon and a Home action, never the server text (UF §16, §32)', async () => {
    mockReport(openRow);
    jest.spyOn(weeklyReportsApi, 'confirmWeeklyReport').mockRejectedValue(
      new ApiError({
        statusCode: 422,
        error: 'NOT_RECITATION_DAY',
        message: 'server wording',
      }),
    );

    renderScreen();
    await answerAndConfirm('yes');

    const banner = await screen.findByTestId('weekly-report-confirm-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(
      screen.getByTestId('weekly-report-confirm-banner-icon'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-confirm-banner-message').props.children,
    ).toBe('تعذر تأكيد التقرير الأسبوعي؛ انتهى يوم التسميع.');
    expect(screen.queryByText('server wording')).toBeNull();

    fireEvent.press(
      screen.getByTestId('weekly-report-confirm-banner-home-button'),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });

  it('5xx on confirm: generic retry copy, the answer preserved and the CTA re-enabled (UF §24)', async () => {
    mockReport(openRow);
    const confirmSpy = jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'internal detail',
        }),
      )
      .mockResolvedValueOnce(finalisedReport);

    renderScreen();
    await answerAndConfirm('yes');

    expect(
      (await screen.findByTestId('weekly-report-confirm-banner-message')).props
        .children,
    ).toBe('حدث خطأ أثناء تأكيد التقرير الأسبوعي');
    expect(screen.queryByText('internal detail')).toBeNull();
    expect(
      screen.queryByTestId('weekly-report-confirm-banner-home-button'),
    ).toBeNull();
    expect(
      screen.getByTestId('attended-toggle-yes').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      screen.getByTestId('confirm-weekly-report-button').props
        .accessibilityState.disabled,
    ).toBe(false);

    fireEvent.press(screen.getByTestId('confirm-weekly-report-button'));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith('/(app)/student'),
    );
  });

  it('network failure on confirm: the network copy, retry action', async () => {
    mockReport(openRow);
    jest
      .spyOn(weeklyReportsApi, 'confirmWeeklyReport')
      .mockRejectedValue(new NetworkError());

    renderScreen();
    await answerAndConfirm('no');

    expect(
      (await screen.findByTestId('weekly-report-confirm-banner-message')).props
        .children,
    ).toBe('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.');
    expect(
      screen.queryByTestId('weekly-report-confirm-banner-home-button'),
    ).toBeNull();
  });

  it('403 on confirm: the filter Arabic message with a Home action', async () => {
    mockReport(openRow);
    jest.spyOn(weeklyReportsApi, 'confirmWeeklyReport').mockRejectedValue(
      new ApiError({
        statusCode: 403,
        error: 'SCOPE_DENIED',
        message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
      }),
    );

    renderScreen();
    await answerAndConfirm('yes');

    expect(
      (await screen.findByTestId('weekly-report-confirm-banner-message')).props
        .children,
    ).toBe('ليس لديك صلاحية للوصول إلى هذا المورد');
    expect(
      screen.getByTestId('weekly-report-confirm-banner-home-button'),
    ).toBeTruthy();
  });

  it('renders a Finalised row read-only with a quiet note and the attendance answer (UF §16, EC-24)', async () => {
    mockReport({
      ...openRow,
      state: 'Finalised',
      attended_recitation_call: true,
      can_confirm: false,
    });

    renderScreen();

    expect(
      await screen.findByTestId('weekly-report-finalised-note'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('weekly-report-attended-line').props.children,
    ).toBe('حضور جلسة التسميع: نعم');
    expect(screen.getByText('معتمد')).toBeTruthy();
    expect(screen.queryByTestId('weekly-report-confirm-section')).toBeNull();
    expect(screen.queryByTestId('weekly-report-live-note')).toBeNull();
    expect(
      screen.queryByTestId('weekly-report-already-finalised-note'),
    ).toBeNull();
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
