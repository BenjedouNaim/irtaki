import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RosterScreen from '../RosterScreen';
import * as membershipsApi from '@/shared/api/memberships.client';
import * as groupsApi from '@/shared/api/groups.client';
import * as performanceApi from '@/shared/api/performance.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/memberships.client');
jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/performance.client');

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  router: { back: jest.fn() },
}));

describe('RosterScreen (F-MEM-02)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockRoster: membershipsApi.RosterEntry[] = [
    {
      id: 'membership-1',
      user: { id: 'user-1', full_name: 'محمد بن علي', gender: 'Male' },
      started_at: '2026-01-15T00:00:00.000Z',
      state: 'Active',
    },
    {
      id: 'membership-2',
      user: { id: 'user-2', full_name: 'فاطمة بن صالح', gender: 'Female' },
      started_at: '2025-09-01T00:00:00.000Z',
      state: 'Terminated',
    },
  ];

  const mockGroup: groupsApi.GroupListItemFull = {
    id: mockGroupId,
    name: 'حلقة الفجر',
    gender: 'Male',
    recitation_day: 6,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: { id: 'teacher-1', full_name: 'الشيخ محمد' },
    assistant: { id: 'assistant-1', full_name: 'سارة' },
  };

  /** API-038's answer, already weakest-first (UF §17). */
  const mockGroupPerformance: performanceApi.GroupPerformanceDto = {
    commitment_average: 62,
    students: [
      {
        membership_id: 'membership-1',
        full_name: 'محمد بن علي',
        commitment_score: 41,
      },
      {
        membership_id: 'membership-3',
        full_name: 'سلمى العياري',
        commitment_score: 88,
      },
    ],
    absence_breakdown: { sick: 2, studying: 1, other: 0 },
    submission_rate: 83,
  };

  let queryClient: QueryClient;

  /**
   * SCR-23 composes the roster-backed header with F-PERF-02's own query, so
   * the teacher variant needs a QueryClient around it.
   */
  function renderTeacher(props: Record<string, unknown> = {}) {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <RosterScreen groupId={mockGroupId} variant="teacher" {...props} />
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  describe('Admin roster (SCR-30, Figma 41:316)', () => {
    it('renders loading skeleton on initial mount', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockImplementation(() => new Promise(() => {})); // Never resolves

      const { getByTestId, queryByTestId } = render(
        <RosterScreen groupId={mockGroupId} />,
      );

      expect(getByTestId('roster-skeleton')).toBeTruthy();
      expect(getByTestId('roster-top-bar-title').props.children).toBe(
        'قائمة الطلاب',
      );
      expect(queryByTestId('roster-list')).toBeNull();
      expect(queryByTestId('roster-empty')).toBeNull();
      expect(queryByTestId('roster-error')).toBeNull();
      expect(groupsApi.getGroupDetail).not.toHaveBeenCalled();
    });

    it('renders current members, then the removed section, with name/gender/date rows and badges', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });

      const { getByTestId, findByText, queryByTestId, getByText } = render(
        <RosterScreen groupId={mockGroupId} groupName="حلقة الفجر" />,
      );

      expect(await findByText('محمد بن علي')).toBeTruthy();
      expect(getByTestId('roster-list')).toBeTruthy();
      expect(queryByTestId('roster-skeleton')).toBeNull();

      expect(getByTestId('roster-head').props.children).toBe(
        'حلقة الفجر · 1 حاليًا',
      );
      expect(getByText('الاسم والجنس فقط')).toBeTruthy();

      expect(getByTestId('roster-row-membership-1')).toBeTruthy();
      expect(getByTestId('roster-row-membership-2')).toBeTruthy();
      expect(getByText('ذكر · منذ 15 جانفي 2026')).toBeTruthy();
      expect(getByText('أنثى · انضم في 1 سبتمبر 2025')).toBeTruthy();

      expect(getByTestId('roster-row-membership-1-badge')).toHaveTextContent(
        'نشط',
      );
      expect(getByTestId('roster-removed-label')).toBeTruthy();
      expect(getByTestId('roster-row-membership-2-badge')).toHaveTextContent(
        'مُزال',
      );
    });

    it('navigates to recovery when pressing a terminated member, but does not navigate for active member', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });

      const { getByTestId, findByText } = render(
        <RosterScreen groupId={mockGroupId} />,
      );

      expect(await findByText('فاطمة بن صالح')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('roster-row-membership-1'));
      });
      expect(mockPush).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.press(getByTestId('roster-row-membership-2'));
      });
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/admin/memberships/[id]/recovery',
        params: { id: 'membership-2' },
      });
    });

    it('renders the empty state when the group has no members', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: [] });

      const { getByTestId, findByText, queryByTestId } = render(
        <RosterScreen groupId={mockGroupId} />,
      );

      expect(await findByText('لا طلاب في هذه المجموعة بعد')).toBeTruthy();
      expect(getByTestId('roster-empty')).toBeTruthy();
      expect(queryByTestId('roster-list')).toBeNull();
      expect(queryByTestId('roster-skeleton')).toBeNull();
    });

    it('renders the error banner with the API message on ApiError and recovers upon retry', async () => {
      const getSpy = jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockRejectedValueOnce(
          new ApiError({
            statusCode: 500,
            error: 'Internal Server Error',
            message: 'خطأ في جلب قائمة الطلاب',
          }),
        )
        .mockResolvedValueOnce({ data: mockRoster });

      const { getByTestId, findByText, queryByTestId } = render(
        <RosterScreen groupId={mockGroupId} />,
      );

      expect(await findByText('خطأ في جلب قائمة الطلاب')).toBeTruthy();
      expect(getByTestId('roster-error').props.accessibilityRole).toBe('alert');
      expect(queryByTestId('roster-list')).toBeNull();

      await act(async () => {
        fireEvent.press(getByTestId('roster-error-retry-button'));
      });

      expect(await findByText('محمد بن علي')).toBeTruthy();
      expect(queryByTestId('roster-error')).toBeNull();
      expect(getByTestId('roster-list')).toBeTruthy();
      expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('renders generic connectivity error message on non-ApiError failure', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockRejectedValueOnce(new Error('Network error'));

      const { getByTestId, findByText } = render(
        <RosterScreen groupId={mockGroupId} />,
      );

      expect(
        await findByText(
          'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
        ),
      ).toBeTruthy();
      expect(getByTestId('roster-error')).toBeTruthy();
    });
  });

  describe('Teacher group detail (SCR-23, Figma 37:124)', () => {
    beforeEach(() => {
      jest
        .spyOn(groupsApi, 'getGroupDetail')
        .mockResolvedValue({ data: mockGroup });
      jest
        .spyOn(performanceApi, 'getGroupPerformance')
        .mockResolvedValue(mockGroupPerformance);
    });

    it('assembles the header, the enrollment toggle and the Group Performance content', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });

      const { findByTestId, getByTestId, getByText, queryByTestId } =
        renderTeacher({ canOpenRecovery: false });

      expect(await findByTestId('group-performance-students')).toBeTruthy();
      expect(groupsApi.getGroupDetail).toHaveBeenCalledWith(mockGroupId);
      expect(getByTestId('roster-top-bar-title').props.children).toBe(
        'حلقة الفجر',
      );
      // The header count stays the group's Active roster, not the period's.
      expect(getByTestId('roster-group-meta').props.children).toBe(
        'السبت · طالب واحد',
      );
      expect(getByTestId('roster-lifecycle-badge')).toHaveTextContent('نشطة');
      expect(getByTestId('enrollment-toggle')).toBeTruthy();
      expect(getByTestId('enrollment-toggle-label').props.children).toBe(
        'التسجيل مفتوح',
      );
      // F-PERF-02's half of the screen.
      expect(getByTestId('group-performance-period')).toBeTruthy();
      expect(
        getByTestId('group-performance-submission-value').props.children,
      ).toBe('83%');
      expect(
        getByTestId('group-performance-average-value').props.children,
      ).toBe('62%');
      expect(getByText('أسباب الغياب')).toBeTruthy();
      expect(getByText('الأضعف أولًا')).toBeTruthy();
      // The Admin roster head never appears on the Teacher's screen.
      expect(queryByTestId('roster-head')).toBeNull();
    });

    it('lists the API-038 member set, not the roster (FR-PERF-09/10, UF §17)', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });

      const { findByTestId, getByText, queryByText } = renderTeacher();

      expect(await findByTestId('group-performance-students')).toBeTruthy();
      expect(performanceApi.getGroupPerformance).toHaveBeenCalledWith(
        mockGroupId,
        { period: 'week' },
      );
      // membership-3 is in the period's member set but not in the roster page;
      // membership-2 is in the roster but not in the period's set.
      expect(getByText('سلمى العياري')).toBeTruthy();
      expect(queryByText('فاطمة بن صالح')).toBeNull();
    });

    it('flips the enrollment toggle through the existing behaviour', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: [] });
      (groupsApi.toggleEnrollment as jest.Mock).mockResolvedValueOnce({
        data: { id: mockGroupId, enrollment_status: 'Closed' },
      });

      const { findByTestId, getByTestId } = renderTeacher();

      const toggle = await findByTestId('enrollment-toggle-button');
      await act(async () => {
        fireEvent.press(toggle);
      });

      expect(groupsApi.toggleEnrollment).toHaveBeenCalledWith(mockGroupId, {
        enrollment_status: 'Closed',
      });
      expect(getByTestId('enrollment-toggle-label').props.children).toBe(
        'التسجيل مغلق',
      );
    });

    it('hands a tapped student, with the roster fields SCR-24 shows, to onStudentPress', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });
      const onStudentPress = jest.fn();

      const { findByTestId, getByTestId } = renderTeacher({
        onStudentPress,
        canOpenRecovery: false,
      });

      expect(await findByTestId('group-performance-students')).toBeTruthy();

      await act(async () => {
        fireEvent.press(getByTestId('group-performance-student-membership-1'));
      });

      expect(onStudentPress).toHaveBeenCalledWith(
        mockGroupPerformance.students[0],
        {
          gender: mockRoster[0].user.gender,
          startedAt: mockRoster[0].started_at,
          groupName: mockGroup.name,
        },
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('replaces the content with the retry banner when the group itself cannot be loaded', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValue({ data: mockRoster });
      jest.spyOn(groupsApi, 'getGroupDetail').mockRejectedValueOnce(
        new ApiError({
          statusCode: 403,
          error: 'SCOPE_DENIED',
          message: 'ليس لديك صلاحية للوصول إلى هذا المورد',
        }),
      );

      const { findByTestId, getByText, queryByTestId } = renderTeacher();

      expect(await findByTestId('roster-error')).toBeTruthy();
      expect(getByText('ليس لديك صلاحية للوصول إلى هذا المورد')).toBeTruthy();
      expect(queryByTestId('enrollment-toggle')).toBeNull();
      expect(queryByTestId('group-performance')).toBeNull();
    });

    it('keeps the header and the toggle when only the performance call fails (UF §24)', async () => {
      jest
        .spyOn(membershipsApi, 'getGroupMemberships')
        .mockResolvedValueOnce({ data: mockRoster });
      jest.spyOn(performanceApi, 'getGroupPerformance').mockRejectedValue(
        new ApiError({
          statusCode: 500,
          error: 'INTERNAL_ERROR',
          message: 'Internal server error detail',
        }),
      );

      const { findByTestId, getByTestId, queryByText } = renderTeacher();

      expect(await findByTestId('group-performance-error')).toBeTruthy();
      expect(getByTestId('enrollment-toggle')).toBeTruthy();
      expect(getByTestId('roster-lifecycle-badge')).toBeTruthy();
      expect(queryByText('Internal server error detail')).toBeNull();
    });
  });
});
