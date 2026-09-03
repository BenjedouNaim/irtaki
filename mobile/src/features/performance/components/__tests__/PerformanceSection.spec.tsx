import React from 'react';
import { Text } from 'react-native';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PerformanceSection } from '../PerformanceSection';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';

jest.mock('@/shared/api/performance.client');

const mockPerformance: performanceApi.PerformanceDto = {
  commitment_score: 77.5,
  submission_rate: 80,
  memorization_rate: 50,
  revision_rate: 80,
  attendance_rate: 100,
  repetition_quality: 50,
  day_breakdown: {
    normal: 3,
    revision: 1,
    absent_excused: 1,
    absent_other: 0,
    no_report: 1,
  },
  days_since_last_report: 1,
};

const allNull: performanceApi.PerformanceDto = {
  commitment_score: null,
  submission_rate: null,
  memorization_rate: null,
  revision_rate: null,
  attendance_rate: null,
  repetition_quality: null,
  day_breakdown: {
    normal: 0,
    revision: 0,
    absent_excused: 0,
    absent_other: 0,
    no_report: 0,
  },
  days_since_last_report: 0,
};

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل بيانات الأداء';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

let queryClient: QueryClient;

function renderSection(children?: React.ReactNode) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PerformanceSection>{children}</PerformanceSection>
    </QueryClientProvider>,
  );
}

describe('PerformanceSection (SCR-13 Performance, F-PERF-01, Figma 30:553)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('period selector (FR-PERF-03, SegmentedControl Count=4)', () => {
    it('renders the four Figma segments with أسبوع selected first', async () => {
      jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue(mockPerformance);

      renderSection();

      expect(
        await screen.findByTestId('performance-section-score'),
      ).toBeTruthy();
      expect(screen.getByText('أسبوع')).toBeTruthy();
      expect(screen.getByText('شهر')).toBeTruthy();
      expect(screen.getByText('3 أشهر')).toBeTruthy();
      expect(screen.getByText('مخصص')).toBeTruthy();
      expect(
        screen.getByTestId('performance-section-period-week').props
          .accessibilityState.selected,
      ).toBe(true);
    });

    it('refetches for the chosen period', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue(mockPerformance);

      renderSection();
      await screen.findByTestId('performance-section-score');

      fireEvent.press(screen.getByTestId('performance-section-period-3months'));

      await waitFor(() =>
        expect(spy).toHaveBeenCalledWith({ period: '3months' }),
      );
    });

    it('leaves مخصص present but not selectable — SCR-13 has no range picker', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue(mockPerformance);

      renderSection();
      await screen.findByTestId('performance-section-score');
      spy.mockClear();

      const custom = screen.getByTestId('performance-section-period-custom');
      expect(custom.props.accessibilityState.disabled).toBe(true);
      fireEvent.press(custom);

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('loading and error states (UF §22, §24)', () => {
    it('renders layout-matched skeletons above and below the memorization slot', () => {
      jest.spyOn(performanceApi, 'getMyPerformance').mockImplementation(NEVER);

      renderSection(<Text testID="memorization-slot">تقدّم الحفظ</Text>);

      expect(
        screen.getByTestId('performance-section-score-skeleton'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('performance-section-detail-skeleton'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('skeleton-performance-score-value'),
      ).toBeTruthy();
      expect(screen.getByTestId('skeleton-performance-donut')).toBeTruthy();
      expect(screen.getByTestId('skeleton-performance-tile-0')).toBeTruthy();
      expect(
        screen.getByTestId('skeleton-performance-days-since'),
      ).toBeTruthy();
      // The slot keeps its place while the performance data loads.
      expect(screen.getByTestId('memorization-slot')).toBeTruthy();
      expect(screen.queryByTestId('performance-section-score')).toBeNull();
    });

    it('shows the generic Arabic copy for a 5xx, never the server message (UF §24)', async () => {
      jest.spyOn(performanceApi, 'getMyPerformance').mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'Internal database failure at row 42',
        }),
      );

      renderSection();

      expect(
        await screen.findByTestId('performance-section-error'),
      ).toBeTruthy();
      expect(screen.getByText(GENERIC_SERVER_MESSAGE)).toBeTruthy();
      expect(
        screen.queryByText('Internal database failure at row 42'),
      ).toBeNull();
      expect(screen.queryByTestId('performance-section-breakdown')).toBeNull();
    });

    it('shows the connectivity copy for a network failure and retries on demand', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockRejectedValue(new NetworkError('offline'));

      renderSection();

      expect(await screen.findByText(NETWORK_MESSAGE)).toBeTruthy();

      spy.mockResolvedValue(mockPerformance);
      fireEvent.press(
        screen.getByTestId('performance-section-error-retry-button'),
      );

      expect(
        await screen.findByTestId('performance-section-score'),
      ).toBeTruthy();
    });

    it('keeps the period selector usable while erroring', async () => {
      jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockRejectedValue(new NetworkError('offline'));

      renderSection();
      await screen.findByTestId('performance-section-error');

      expect(
        screen.getByTestId('performance-section-period-month'),
      ).toBeTruthy();
    });
  });

  describe('the rendered figures (UF §17)', () => {
    beforeEach(() => {
      jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue(mockPerformance);
    });

    it('renders the commitment score as a large number with a separate % glyph', async () => {
      renderSection();

      expect(
        (await screen.findByTestId('performance-section-score-value')).props
          .children,
      ).toBe('78');
      expect(screen.getByText('نسبة الالتزام')).toBeTruthy();
      expect(screen.getByText('%')).toBeTruthy();
    });

    it('captions the score with the period and the §17 no-trend-line note', async () => {
      renderSection();

      expect(
        (await screen.findByTestId('performance-section-score-caption')).props
          .children,
      ).toBe('هذا الأسبوع · لا يوجد خط اتجاه في هذه النسخة');
    });

    it('renders the five-segment day breakdown donut with the Figma legend', async () => {
      renderSection();

      expect(
        await screen.findByTestId('performance-section-breakdown'),
      ).toBeTruthy();
      expect(screen.getByText('توزيع الأيام')).toBeTruthy();
      for (const label of [
        'عادي',
        'مراجعة',
        'غياب بعذر',
        'غياب بدون عذر',
        'فائت',
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }
      expect(
        screen.getByTestId('performance-section-donut-legend-normal-value')
          .props.children,
      ).toBe('3');
      expect(
        screen.getByTestId('performance-section-donut-legend-no_report-value')
          .props.children,
      ).toBe('1');
    });

    it('shows repetition quality and recitation attendance as standalone tiles', async () => {
      renderSection();

      expect(
        await screen.findByTestId('performance-section-quality'),
      ).toBeTruthy();
      expect(
        screen.getByTestId('performance-section-quality-value').props.children,
      ).toBe('50%');
      expect(
        screen.getByTestId('performance-section-attendance-value').props
          .children,
      ).toBe('100%');
      expect(screen.getByText('جودة التكرار')).toBeTruthy();
      expect(screen.getByText('حضور التسميع')).toBeTruthy();
    });

    it('renders days since last report without an alert below the threshold', async () => {
      renderSection();

      expect(
        (await screen.findByTestId('performance-section-days-since-value'))
          .props.children,
      ).toBe('1');
      expect(screen.getByText('أيام منذ آخر تقرير')).toBeTruthy();
      expect(
        screen.queryByTestId('performance-section-days-since-alert'),
      ).toBeNull();
    });

    it('renders the memorization slot between the score and the breakdown (Figma order)', async () => {
      renderSection(<Text testID="memorization-slot">تقدّم الحفظ</Text>);

      await screen.findByTestId('performance-section-score');
      expect(screen.getByTestId('memorization-slot')).toBeTruthy();
      expect(screen.getByTestId('performance-section-breakdown')).toBeTruthy();
    });
  });

  describe('nullable rates — never 0% (DEC-B04 / API-X07, UF §17)', () => {
    it('renders "بيانات غير كافية" for a null score, not a zero', async () => {
      jest.spyOn(performanceApi, 'getMyPerformance').mockResolvedValue(allNull);

      renderSection();

      expect(
        (await screen.findByTestId('performance-section-score-value')).props
          .children,
      ).toBe('—');
      expect(
        screen.getByTestId('performance-section-score-caption').props.children,
      ).toBe(METRIC_NULL_PLACEHOLDER);
      expect(screen.queryByText('0%')).toBeNull();
      expect(screen.queryByText('%')).toBeNull();
    });

    it('renders the null tile state for undefined quality and attendance', async () => {
      jest.spyOn(performanceApi, 'getMyPerformance').mockResolvedValue(allNull);

      renderSection();

      expect(
        (await screen.findByTestId('performance-section-quality-value')).props
          .children,
      ).toBe('—');
      expect(
        screen.getByTestId('performance-section-attendance-value').props
          .children,
      ).toBe('—');
      expect(
        screen.getAllByText(METRIC_NULL_PLACEHOLDER).length,
      ).toBeGreaterThanOrEqual(2);
    });

    it('still renders a real 0% distinctly from an undefined rate', async () => {
      jest.spyOn(performanceApi, 'getMyPerformance').mockResolvedValue({
        ...allNull,
        attendance_rate: 0,
        commitment_score: 0,
      });

      renderSection();

      expect(
        (await screen.findByTestId('performance-section-attendance-value'))
          .props.children,
      ).toBe('0%');
      expect(
        screen.getByTestId('performance-section-score-value').props.children,
      ).toBe('0');
      // Quality is still undefined and must not borrow the zero.
      expect(
        screen.getByTestId('performance-section-quality-value').props.children,
      ).toBe('—');
    });
  });

  describe('at-risk recency (UF §17 "red at ≥3", UF §32 never colour-only)', () => {
    it('pairs the alert icon with the text at three expected days or more', async () => {
      jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue({ ...mockPerformance, days_since_last_report: 3 });

      renderSection();

      expect(
        await screen.findByTestId('performance-section-days-since-alert'),
      ).toBeTruthy();
      const row = screen.getByTestId('performance-section-days-since');
      expect(row.props.accessibilityLabel).toContain('3');
      // The alert is icon + text, never colour alone (UF §32).
      expect(
        screen.getByTestId('performance-section-days-since-alert').props
          .accessibilityLabel,
      ).toBe('لم تُسجَّل تقارير لثلاثة أيام متوقعة أو أكثر');
    });

    it('does not alert at two days', async () => {
      jest
        .spyOn(performanceApi, 'getMyPerformance')
        .mockResolvedValue({ ...mockPerformance, days_since_last_report: 2 });

      renderSection();

      await screen.findByTestId('performance-section-days-since');
      expect(
        screen.queryByTestId('performance-section-days-since-alert'),
      ).toBeNull();
    });
  });

  it('lets metric text scale without clipping (UF §32)', async () => {
    jest
      .spyOn(performanceApi, 'getMyPerformance')
      .mockResolvedValue(mockPerformance);

    renderSection();

    const value = await screen.findByTestId('performance-section-score-value');
    expect(value.props.maxFontSizeMultiplier).toBe(1.5);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  describe('SCR-24 reuse: the same section against API-039 (F-PERF-03)', () => {
    function renderForMembership() {
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: Infinity } },
      });
      return render(
        <QueryClientProvider client={queryClient}>
          <PerformanceSection membershipId="membership-1" />
        </QueryClientProvider>,
      );
    }

    it('reads the membership route and leaves the own route un-run', async () => {
      jest
        .spyOn(performanceApi, 'getMembershipPerformance')
        .mockResolvedValue(mockPerformance);
      jest.spyOn(performanceApi, 'getMyPerformance').mockImplementation(NEVER);

      renderForMembership();

      await waitFor(() =>
        expect(performanceApi.getMembershipPerformance).toHaveBeenCalledWith(
          'membership-1',
          { period: 'week' },
        ),
      );
      expect(performanceApi.getMyPerformance).not.toHaveBeenCalled();
    });

    it('renders exactly the same cards from the identical payload (APIS §10.9)', async () => {
      jest
        .spyOn(performanceApi, 'getMembershipPerformance')
        .mockResolvedValue(mockPerformance);

      renderForMembership();

      expect(
        (await screen.findByTestId('performance-section-score-value')).props
          .children,
      ).toBe('78');
      expect(screen.getByTestId('performance-section-donut')).toBeTruthy();
      expect(screen.getByTestId('performance-section-quality')).toBeTruthy();
      expect(screen.getByTestId('performance-section-days-since')).toBeTruthy();
    });

    it('carries the period change onto the membership route', async () => {
      jest
        .spyOn(performanceApi, 'getMembershipPerformance')
        .mockResolvedValue(mockPerformance);

      renderForMembership();
      await screen.findByTestId('performance-section-score');

      fireEvent.press(screen.getByText('3 أشهر'));

      await waitFor(() =>
        expect(performanceApi.getMembershipPerformance).toHaveBeenCalledWith(
          'membership-1',
          { period: '3months' },
        ),
      );
    });

    it('shows the generic 5xx copy, never the server message (UF §24)', async () => {
      jest.spyOn(performanceApi, 'getMembershipPerformance').mockRejectedValue(
        new ApiError({
          statusCode: 503,
          error: 'INTERNAL_ERROR',
          message: 'upstream down',
        }),
      );

      renderForMembership();

      expect(await screen.findByText(GENERIC_SERVER_MESSAGE)).toBeTruthy();
      expect(screen.queryByText('upstream down')).toBeNull();
    });
  });
});
