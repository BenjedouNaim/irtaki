import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportTypeSelectionScreen } from '../ReportTypeSelectionScreen';
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

const NEVER = () => new Promise<never>(() => {});

let queryClient: QueryClient;

function renderScreen(
  props: React.ComponentProps<typeof ReportTypeSelectionScreen> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportTypeSelectionScreen {...props} />
    </QueryClientProvider>,
  );
}

describe('ReportTypeSelectionScreen (SCR-09, F-DR-01, Figma 26:331)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders row skeletons while the status loads (UF §22)', () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockImplementation(NEVER);

    renderScreen();

    expect(screen.getByTestId('report-type-selection-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('report-type-cards')).toBeNull();
  });

  it('renders three equal-weight cards with no default selection when can_submit=true (UF §15)', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: true });

    renderScreen();

    expect(await screen.findByTestId('report-type-cards')).toBeTruthy();
    expect(screen.getByText('ما نوع تقرير اليوم؟')).toBeTruthy();
    expect(screen.getByText('تقرير عادي')).toBeTruthy();
    expect(screen.getByText('مراجعة فقط')).toBeTruthy();
    expect(screen.getByText('غياب')).toBeTruthy();

    const cards = [
      'report-type-card-normal',
      'report-type-card-revision',
      'report-type-card-absent',
    ].map((id) => screen.getByTestId(id));
    cards.forEach((card) => {
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityState?.selected).toBeFalsy();
    });
    expect(screen.queryByTestId('report-type-selection-blocked')).toBeNull();
  });

  it.each([
    ['report-type-card-normal', 'Normal'],
    ['report-type-card-revision', 'Revision'],
    ['report-type-card-absent', 'Absent'],
  ])('reports the chosen type from %s', async (testID, type) => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: true });
    const onSelectType = jest.fn();

    renderScreen({ onSelectType });

    fireEvent.press(await screen.findByTestId(testID));
    expect(onSelectType).toHaveBeenCalledWith(type);
  });

  it.each([
    ['already_submitted', 'تم إرسال تقرير اليوم مسبقاً.'],
    ['recitation_day', 'اليوم هو يوم التسميع، ولا يُرسل فيه تقرير يومي.'],
    ['group_archived', 'مجموعتك لم تعد نشطة. لا يمكن إرسال التقارير حاليًا.'],
    [
      'membership_inactive',
      'عضويتك في الحلقة غير نشطة. لا يمكن إرسال التقارير حاليًا.',
    ],
  ] as const)(
    'is gated on can_submit: hides the cards and shows the server reason for %s',
    async (blockReason, message) => {
      jest
        .spyOn(dailyReportsApi, 'getTodayReportStatus')
        .mockResolvedValue({ can_submit: false, block_reason: blockReason });

      renderScreen({ onSelectType: jest.fn() });

      expect(
        await screen.findByTestId('report-type-selection-blocked'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('report-type-selection-blocked-banner').props
          .accessibilityRole,
      ).toBe('alert');
      expect(screen.getByText(message)).toBeTruthy();
      expect(screen.getByLabelText('تنبيه')).toBeTruthy();
      expect(screen.queryByTestId('report-type-cards')).toBeNull();
      expect(screen.queryByTestId('report-type-card-normal')).toBeNull();
    },
  );

  it('goes back from the blocked state, falling back to Student Home when there is no history', async () => {
    jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockResolvedValue({ can_submit: false, block_reason: 'recitation_day' });

    renderScreen();

    fireEvent.press(
      await screen.findByTestId('report-type-selection-back-button'),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    mockCanGoBack.mockReturnValue(false);
    fireEvent.press(screen.getByTestId('report-type-selection-back-button'));
    expect(mockReplace).toHaveBeenCalledWith('/(app)/student');
  });

  it('shows the generic retry message on a 5xx, never the server string, and retries (UF §24)', async () => {
    const spy = jest
      .spyOn(dailyReportsApi, 'getTodayReportStatus')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'FATAL: relation "daily_reports" does not exist',
        }),
      )
      .mockResolvedValueOnce({ can_submit: true });

    renderScreen();

    const banner = await screen.findByTestId('report-type-selection-error');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(
      screen.getByTestId('report-type-selection-error-message').props.children,
    ).toBe('حدث خطأ أثناء تحميل حالة تقرير اليوم');
    expect(screen.queryByText(/relation/)).toBeNull();
    expect(screen.getByLabelText('تنبيه')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('report-type-selection-error-retry-button'),
    );
    expect(await screen.findByTestId('report-type-cards')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
