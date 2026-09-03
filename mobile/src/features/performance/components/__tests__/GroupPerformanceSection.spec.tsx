import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GroupPerformanceSection } from '../GroupPerformanceSection';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { METRIC_NULL_PLACEHOLDER } from '@/shared/components/MetricRow';

jest.mock('@/shared/api/performance.client');

const GROUP_ID = 'group-1';

/** API-038 returns the list already ordered weakest-first (UF §17). */
const mockGroupPerformance: performanceApi.GroupPerformanceDto = {
  commitment_average: 62,
  students: [
    { membership_id: 'm-1', full_name: 'يوسف بن سالم', commitment_score: 41 },
    { membership_id: 'm-2', full_name: 'مريم الجبالي', commitment_score: 52 },
    { membership_id: 'm-3', full_name: 'أحمد الطرابلسي', commitment_score: 94 },
  ],
  absence_breakdown: { sick: 14, studying: 5, other: 3 },
  submission_rate: 83,
};

const allNull: performanceApi.GroupPerformanceDto = {
  commitment_average: null,
  students: [
    { membership_id: 'm-1', full_name: 'يوسف بن سالم', commitment_score: null },
  ],
  absence_breakdown: { sick: 0, studying: 0, other: 0 },
  submission_rate: null,
};

const empty: performanceApi.GroupPerformanceDto = {
  commitment_average: null,
  students: [],
  absence_breakdown: { sick: 0, studying: 0, other: 0 },
  submission_rate: null,
};

/**
 * API-040's list — deliberately NOT the weakest students: the badge is a
 * separate predicate, "never inferred from a low score alone" (UF §17). The
 * 41% student is silent-free and the 52% and 94% ones are flagged.
 */
const mockAtRisk: performanceApi.AtRiskEntryDto[] = [
  {
    membership_id: 'm-2',
    full_name: 'مريم الجبالي',
    days_since_last_report: 3,
  },
  {
    membership_id: 'm-3',
    full_name: 'أحمد الطرابلسي',
    days_since_last_report: 12,
  },
];

const NEVER = () => new Promise<never>(() => {});

const GENERIC_SERVER_MESSAGE = 'حدث خطأ أثناء تحميل أداء المجموعة';
const NETWORK_MESSAGE = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';

let queryClient: QueryClient;

function renderSection(
  props: Partial<React.ComponentProps<typeof GroupPerformanceSection>> = {},
) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GroupPerformanceSection groupId={GROUP_ID} {...props} />
    </QueryClientProvider>,
  );
}

describe('GroupPerformanceSection (SCR-23, F-PERF-02, Figma 37:124)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Most cases care only about API-038; the at-risk call defaults to an
    // empty list so no row is flagged unless the test says so.
    jest.spyOn(performanceApi, 'getGroupAtRisk').mockResolvedValue([]);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('period selector (FR-PERF-03, SegmentedControl Count=4)', () => {
    it('renders the four Figma segments with أسبوع selected first', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      expect(
        await screen.findByTestId('group-performance-students'),
      ).toBeTruthy();
      expect(screen.getByText('أسبوع')).toBeTruthy();
      expect(screen.getByText('شهر')).toBeTruthy();
      expect(screen.getByText('3 أشهر')).toBeTruthy();
      expect(screen.getByText('مخصص')).toBeTruthy();
      expect(
        screen.getByTestId('group-performance-period-week').props
          .accessibilityState.selected,
      ).toBe(true);
    });

    it('refetches for the chosen period — the member set itself changes (FR-PERF-09/10)', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();
      await screen.findByTestId('group-performance-students');

      fireEvent.press(screen.getByTestId('group-performance-period-month'));

      await waitFor(() =>
        expect(spy).toHaveBeenCalledWith(GROUP_ID, { period: 'month' }),
      );
    });

    it('leaves مخصص present but not selectable — SCR-23 has no range picker', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();
      await screen.findByTestId('group-performance-students');

      fireEvent.press(screen.getByTestId('group-performance-period-custom'));

      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect(spy).toHaveBeenLastCalledWith(GROUP_ID, { period: 'week' });
    });
  });

  describe('the four API-038 figures', () => {
    it('renders the submission rate and the commitment average as tiles', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      expect(
        (await screen.findByTestId('group-performance-submission-value')).props
          .children,
      ).toBe('83%');
      expect(
        screen.getByTestId('group-performance-submission-label').props.children,
      ).toBe('نسبة الإرسال');
      expect(
        screen.getByTestId('group-performance-average-value').props.children,
      ).toBe('62%');
      expect(
        screen.getByTestId('group-performance-average-label').props.children,
      ).toBe('متوسط الالتزام');
      // Figma's caption: how many students the average is over.
      expect(
        screen.getByTestId('group-performance-average-caption').props.children,
      ).toBe('3 طلاب');
    });

    it('leads with the commitment average — the reading-start tile (UF §31)', async () => {
      // Figma 37:179 puts the average at x=184 (right) and the submission
      // rate at x=0 (left); in a `rowStart` row the FIRST child is the
      // rightmost, so the average must be rendered first.
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      const tiles = await screen.findByTestId('group-performance-tiles');
      expect(
        tiles.props.children.map(
          (tile: { props: { testID: string } }) => tile.props.testID,
        ),
      ).toEqual(['group-performance-average', 'group-performance-submission']);
    });

    it('renders the absence reasons as the group donut (UF §17)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      expect(await screen.findByTestId('group-performance-donut')).toBeTruthy();
      expect(screen.getByText('أسباب الغياب')).toBeTruthy();
      expect(screen.getByText('مريض')).toBeTruthy();
      expect(screen.getByText('دراسة')).toBeTruthy();
      expect(screen.getByText('سبب آخر')).toBeTruthy();
      expect(screen.getByText('14')).toBeTruthy();
    });

    it('renders every null figure as "بيانات غير كافية", never 0% (DEC-B04)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(allNull);

      renderSection();

      expect(
        (await screen.findByTestId('group-performance-submission-value')).props
          .children,
      ).toBe('—');
      expect(
        screen.getByTestId('group-performance-average-value').props.children,
      ).toBe('—');
      expect(
        screen.getByTestId('group-performance-submission-caption').props
          .children,
      ).toBe(METRIC_NULL_PLACEHOLDER);
      expect(screen.queryByText('0%')).toBeNull();
    });
  });

  describe('the weakest-first student list (UF §17, AC-15)', () => {
    it('renders the rows in the order the server returned, never re-sorted', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      const list = await screen.findByTestId('group-performance-students');
      const ids = list.props.children.map(
        (row: { props: { testID: string } }) => row.props.testID,
      );
      expect(ids).toEqual([
        'group-performance-student-m-1',
        'group-performance-student-m-2',
        'group-performance-student-m-3',
      ]);
      expect(screen.getByText('الأضعف أولًا')).toBeTruthy();
      expect(screen.getByText('الطلاب')).toBeTruthy();
    });

    it('shows each student’s name and rounded score', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      expect(await screen.findByText('يوسف بن سالم')).toBeTruthy();
      expect(
        screen.getByTestId('group-performance-student-m-1-score').props
          .children,
      ).toBe('41%');
      expect(
        screen.getByTestId('group-performance-student-m-3-score').props
          .children,
      ).toBe('94%');
    });

    it('renders an em-dash for a student with no data, never 0%', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(allNull);

      renderSection();

      expect(
        (await screen.findByTestId('group-performance-student-m-1-score')).props
          .children,
      ).toBe('—');
    });

    it('hands the tapped student to onStudentPress (→ SCR-25)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      const onStudentPress = jest.fn();

      renderSection({ onStudentPress });

      fireEvent.press(
        await screen.findByTestId('group-performance-student-m-2'),
      );

      expect(onStudentPress).toHaveBeenCalledWith(
        mockGroupPerformance.students[1],
      );
    });

    it('leaves the rows inert without a handler — navigation offers no missing screen', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      const row = await screen.findByTestId('group-performance-student-m-1');
      expect(row.props.accessibilityState.disabled).toBe(true);
    });

    it('shows the factual empty state when the period has no members (UF §23)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(empty);

      renderSection();

      expect(await screen.findByTestId('group-performance-empty')).toBeTruthy();
      expect(
        screen.getByText('لا طلاب في هذه المجموعة خلال هذه الفترة'),
      ).toBeTruthy();
      expect(screen.queryByTestId('group-performance-students')).toBeNull();
    });
  });

  describe('loading and error states (UF §22, §24)', () => {
    it('shows a layout-matched skeleton on first load (UF §22)', () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockImplementation(NEVER);

      renderSection();

      expect(screen.getByTestId('group-performance-skeleton')).toBeTruthy();
      expect(screen.getByTestId('skeleton-group-donut')).toBeTruthy();
      expect(screen.getByTestId('skeleton-group-student-0')).toBeTruthy();
      // The period selector stays usable while the content loads.
      expect(screen.getByTestId('group-performance-period')).toBeTruthy();
    });

    it('shows the generic Arabic copy for a 5xx, never the server message', async () => {
      jest.spyOn(performanceApi, 'getGroupPerformance').mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'Internal server error detail',
        }),
      );

      renderSection();

      expect(await screen.findByTestId('group-performance-error')).toBeTruthy();
      expect(screen.getByText(GENERIC_SERVER_MESSAGE)).toBeTruthy();
      expect(screen.queryByText('Internal server error detail')).toBeNull();
    });

    it('shows the network retry copy when the request never reaches the server', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockRejectedValue(new NetworkError('boom'));

      renderSection();

      expect(await screen.findByTestId('group-performance-error')).toBeTruthy();
      expect(screen.getByText(NETWORK_MESSAGE)).toBeTruthy();
    });

    it('shows a 4xx filter message verbatim and retries on demand', async () => {
      const spy = jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode: 403,
            error: 'SCOPE_DENIED',
            message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
          }),
        )
        .mockResolvedValue(mockGroupPerformance);

      renderSection();

      expect(await screen.findByTestId('group-performance-error')).toBeTruthy();
      expect(
        screen.getByText('ليس لديك صلاحية للوصول إلى هذا المورد'),
      ).toBeTruthy();

      fireEvent.press(
        screen.getByTestId('group-performance-error-retry-button'),
      );

      expect(
        await screen.findByTestId('group-performance-students'),
      ).toBeTruthy();
      expect(spy).toHaveBeenCalledTimes(2);
    });
  });

  describe('the at-risk badge (F-PERF-04, API-040, UF §17, Figma 37:228)', () => {
    it('asks API-040 for the group and flags exactly the rows it names', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      expect(
        await screen.findByTestId('group-performance-student-m-2-at-risk'),
      ).toBeTruthy();
      expect(performanceApi.getGroupAtRisk).toHaveBeenCalledWith(GROUP_ID);
      expect(
        screen.getByTestId('group-performance-student-m-3-at-risk'),
      ).toBeTruthy();
      // The weakest student (41%) is NOT on the list and carries no badge —
      // the flag is cross-referenced, never inferred from a low score.
      expect(
        screen.queryByTestId('group-performance-student-m-1-at-risk'),
      ).toBeNull();
    });

    it('pairs the badge with its label and an icon, never colour alone (UF §32)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      expect(
        await screen.findByTestId(
          'group-performance-student-m-2-at-risk-badge',
        ),
      ).toBeTruthy();
      expect(
        screen.getByTestId('group-performance-student-m-2-at-risk-badge-icon', {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
      expect(screen.getAllByText('معرّض للخطر')).toHaveLength(2);
    });

    it('puts the recency line at the reading start and the badge beside it (Figma 37:228)', async () => {
      // The frame places the text at x=113 (right) and the AtRiskBadge at
      // x=0 (left); in a `rowStart` row the FIRST child is the rightmost
      // (UF §31), so the recency line must be rendered before the badge.
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      const row = await screen.findByTestId(
        'group-performance-student-m-2-at-risk',
      );
      expect(
        row.props.children.map(
          (child: { props: { testID: string } }) => child.props.testID,
        ),
      ).toEqual([
        'group-performance-student-m-2-days',
        'group-performance-student-m-2-at-risk-badge',
      ]);
    });

    it('renders the recency line with Arabic number agreement', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      // 3 → "أيام" (few), 12 → "يومًا" (many).
      expect(await screen.findByText('3 أيام منذ آخر تقرير')).toBeTruthy();
      expect(screen.getByText('12 يومًا منذ آخر تقرير')).toBeTruthy();
    });

    it('shows no recency line on a row API-040 did not flag', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      await screen.findByTestId('group-performance-student-m-2-at-risk');
      // No day count exists for an un-flagged student, and none is invented.
      expect(
        screen.queryByTestId('group-performance-student-m-1-days'),
      ).toBeNull();
    });

    it('names the at-risk state in the row’s accessibility label', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();

      const flagged = await screen.findByTestId(
        'group-performance-student-m-2',
      );
      expect(flagged.props.accessibilityLabel).toContain('معرّض للخطر');
      expect(
        screen.getByTestId('group-performance-student-m-1').props
          .accessibilityLabel,
      ).not.toContain('معرّض للخطر');
    });

    it('does NOT refetch the list when the period changes (SAS §18.4)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      const atRisk = jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockResolvedValue(mockAtRisk);

      renderSection();
      await screen.findByTestId('group-performance-students');

      fireEvent.press(screen.getByText('شهر'));

      await waitFor(() =>
        expect(performanceApi.getGroupPerformance).toHaveBeenCalledWith(
          GROUP_ID,
          { period: 'month' },
        ),
      );
      // The predicate always looks backwards from today, so no period can
      // change its answer — one call, whatever the selector says.
      expect(atRisk).toHaveBeenCalledTimes(1);
    });

    it('states the failure rather than silently dropping every badge (UF §24)', async () => {
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
      const atRisk = jest
        .spyOn(performanceApi, 'getGroupAtRisk')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode: 500,
            error: 'INTERNAL_ERROR',
            message: 'Internal server error detail',
          }),
        )
        .mockResolvedValue(mockAtRisk);

      renderSection();

      // The dashboard itself still renders — only the badges are missing.
      expect(
        await screen.findByTestId('group-performance-at-risk-error'),
      ).toBeTruthy();
      expect(
        screen.getByText('تعذر تحميل قائمة الطلاب المعرّضين للخطر'),
      ).toBeTruthy();
      expect(screen.queryByText('Internal server error detail')).toBeNull();
      expect(screen.getByTestId('group-performance-students')).toBeTruthy();

      fireEvent.press(
        screen.getByTestId('group-performance-at-risk-error-retry-button'),
      );

      expect(
        await screen.findByTestId('group-performance-student-m-2-at-risk'),
      ).toBeTruthy();
      expect(atRisk).toHaveBeenCalledTimes(2);
    });
  });
});
