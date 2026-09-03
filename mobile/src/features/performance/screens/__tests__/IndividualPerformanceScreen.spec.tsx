import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IndividualPerformanceScreen } from '../IndividualPerformanceScreen';
import * as performanceApi from '@/shared/api/performance.client';
import * as progressApi from '@/shared/api/progress.client';
import * as quranApi from '@/shared/api/quran.client';
import { ApiError, NetworkError } from '@/shared/api/types';

jest.mock('@/shared/api/performance.client');
jest.mock('@/shared/api/progress.client');
jest.mock('@/shared/api/quran.client');

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  router: { back: jest.fn() },
}));

const MEMBERSHIP_ID = 'membership-1';

const mockPerformance: performanceApi.PerformanceDto = {
  commitment_score: 41,
  submission_rate: 60,
  memorization_rate: 33,
  revision_rate: 50,
  attendance_rate: null,
  repetition_quality: 60,
  day_breakdown: {
    normal: 14,
    revision: 5,
    absent_excused: 3,
    absent_other: 2,
    no_report: 4,
  },
  days_since_last_report: 5,
};

const mockProgress: progressApi.ProgressDto = {
  ahzab_completed: 15,
  coverage_percent: 25,
  last_memorized_position: { surah: 3, ayah: 34, ordinal: 327 },
  is_activity_pointer_only: true,
};

let queryClient: QueryClient;

function renderScreen(
  props: Partial<React.ComponentProps<typeof IndividualPerformanceScreen>> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IndividualPerformanceScreen
        membershipId={MEMBERSHIP_ID}
        studentName="يوسف بن سالم"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe('IndividualPerformanceScreen (SCR-24, F-PERF-03, Figma 38:160)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(performanceApi, 'getMembershipPerformance')
      .mockResolvedValue(mockPerformance);
    jest
      .spyOn(progressApi, 'getMembershipProgress')
      .mockResolvedValue(mockProgress);
    jest.spyOn(quranApi, 'listSurahs').mockResolvedValue([]);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('the membership routes, not the /me ones', () => {
    it('reads API-039 for the score and API-042 for the memorization card', async () => {
      renderScreen();

      await waitFor(() =>
        expect(performanceApi.getMembershipPerformance).toHaveBeenCalledWith(
          MEMBERSHIP_ID,
          { period: 'week' },
        ),
      );
      await waitFor(() =>
        expect(progressApi.getMembershipProgress).toHaveBeenCalledWith(
          MEMBERSHIP_ID,
        ),
      );
      expect(performanceApi.getMyPerformance).not.toHaveBeenCalled();
      expect(progressApi.getMyProgress).not.toHaveBeenCalled();
    });

    it('re-reads API-039 when the period changes (FR-PERF-03)', async () => {
      renderScreen();
      await screen.findByTestId('performance-section-score');

      fireEvent.press(screen.getByText('شهر'));

      await waitFor(() =>
        expect(performanceApi.getMembershipPerformance).toHaveBeenCalledWith(
          MEMBERSHIP_ID,
          { period: 'month' },
        ),
      );
    });
  });

  describe('the frame’s own chrome (Figma 38:160)', () => {
    it('names the screen after the student and offers the back control', async () => {
      renderScreen();

      expect(screen.getByText('يوسف بن سالم')).toBeTruthy();
      fireEvent.press(
        screen.getByTestId('individual-performance-top-bar-back'),
      );
      expect(mockRouter.back).toHaveBeenCalled();
    });

    it('falls back to the Teacher root when there is nothing to go back to', () => {
      mockRouter.canGoBack.mockReturnValueOnce(false);
      renderScreen();

      fireEvent.press(
        screen.getByTestId('individual-performance-top-bar-back'),
      );

      expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/teacher');
    });

    it('assembles the meta line from the roster fields the row carried', () => {
      renderScreen({
        gender: 'Male',
        groupName: 'حلقة الفجر',
        startedAt: '2026-05-03',
      });

      expect(
        screen.getByTestId('individual-performance-meta'),
      ).toHaveTextContent('ذكر · حلقة الفجر · عضو منذ ماي 2026');
    });

    it('omits the meta line entirely when the row carried none of it (UF §8)', () => {
      renderScreen();

      expect(screen.queryByTestId('individual-performance-meta')).toBeNull();
    });

    it('shows the read-only notice (UF §17 — staff never edit a report)', () => {
      renderScreen();

      expect(
        screen.getByText('للقراءة فقط — لا تقييم ولا تعليقات ولا تصحيح.'),
      ).toBeTruthy();
    });

    it('links into the raw reports (SCR-25) only when a handler is given', () => {
      const onOpenRawReports = jest.fn();
      const { rerender } = renderScreen({ onOpenRawReports });

      fireEvent.press(screen.getByTestId('raw-reports-button'));
      expect(onOpenRawReports).toHaveBeenCalled();

      rerender(
        <QueryClientProvider client={queryClient}>
          <IndividualPerformanceScreen membershipId={MEMBERSHIP_ID} />
        </QueryClientProvider>,
      );
      expect(screen.queryByTestId('raw-reports-button')).toBeNull();
    });

    it('does not render an at-risk badge — API-040 does not exist yet (UF §17)', () => {
      renderScreen();

      expect(screen.queryByText('معرّض للخطر')).toBeNull();
    });
  });

  describe('the Progress Tab layout, reused verbatim (UF §28)', () => {
    it('renders the score, the memorization card, the donut and the tiles', async () => {
      renderScreen();

      expect(
        (await screen.findByTestId('performance-section-score-value')).props
          .children,
      ).toBe('41');
      expect(await screen.findByTestId('progress-section-count')).toBeTruthy();
      expect(screen.getByTestId('performance-section-donut')).toBeTruthy();
      expect(screen.getByTestId('performance-section-quality')).toBeTruthy();
      expect(screen.getByTestId('performance-section-attendance')).toBeTruthy();
    });

    it('renders a null rate as "بيانات غير كافية", never 0% (DEC-B04)', async () => {
      jest
        .spyOn(performanceApi, 'getMembershipPerformance')
        .mockResolvedValue({ ...mockPerformance, repetition_quality: null });
      renderScreen();

      await screen.findByTestId('performance-section-score');

      expect(screen.getAllByText('بيانات غير كافية').length).toBeGreaterThan(0);
      expect(screen.queryByText('0%')).toBeNull();
    });

    it('flags a recency of 5 expected days in the alert tone (UF §17 "red at ≥3")', async () => {
      renderScreen();

      expect(
        (await screen.findByTestId('performance-section-days-since-value'))
          .props.children,
      ).toBe('5');
      expect(
        screen.getByTestId('performance-section-days-since-alert'),
      ).toBeTruthy();
    });
  });

  describe('errors (UF §24)', () => {
    it('shows the generic Arabic copy on a 5xx, never the server message', async () => {
      jest.spyOn(performanceApi, 'getMembershipPerformance').mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'stack trace leaked',
        }),
      );
      renderScreen();

      expect(
        await screen.findByText('حدث خطأ أثناء تحميل بيانات الأداء'),
      ).toBeTruthy();
      expect(screen.queryByText('stack trace leaked')).toBeNull();
    });

    it('shows the connectivity copy on a network failure', async () => {
      jest
        .spyOn(performanceApi, 'getMembershipPerformance')
        .mockRejectedValue(new NetworkError());
      renderScreen();

      expect(
        await screen.findByText(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
        ),
      ).toBeTruthy();
    });
  });
});
