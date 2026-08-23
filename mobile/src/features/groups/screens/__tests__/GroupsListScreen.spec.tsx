import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { GroupsListScreen } from '../GroupsListScreen';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

describe('GroupsListScreen (SCR-27 / F-GRP-10)', () => {
  const mockGroups: groupsApi.GroupListItemFull[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'حلقة الإمام قالون النموذجية',
      gender: 'Male',
      recitation_day: 5, // الجمعة
      enrollment_status: 'Open',
      lifecycle_state: 'Active',
      teacher: {
        id: 'teacher-1',
        full_name: 'الشيخ محمد المنصوري',
      },
      assistant: {
        id: 'assistant-1',
        full_name: 'الأستاذ أحمد التونسي',
      },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'حلقة النور والهدى',
      gender: 'Female',
      recitation_day: 2, // الثلاثاء
      enrollment_status: 'Closed',
      lifecycle_state: 'Archived',
      teacher: {
        id: 'teacher-2',
        full_name: null,
      },
      assistant: {
        id: 'assistant-2',
        full_name: null,
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(groupsApi, 'listGroups')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(<GroupsListScreen />);

    expect(getByTestId('groups-list-skeleton')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();
    expect(queryByTestId('groups-list-empty')).toBeNull();
    expect(queryByTestId('groups-list-error')).toBeNull();
  });

  it('renders populated list with all group cards and details when API succeeds', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: mockGroups,
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );

    // Header and screen
    expect(getByTestId('groups-list-screen')).toBeTruthy();
    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(queryByTestId('groups-list-skeleton')).toBeNull();

    // Group 1 assertions
    expect(
      getByTestId('group-row-11111111-1111-1111-1111-111111111111'),
    ).toBeTruthy();
    expect(
      getByTestId('group-name-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('حلقة الإمام قالون النموذجية');
    expect(
      getByTestId(
        'group-enrollment-badge-11111111-1111-1111-1111-111111111111',
      ),
    ).toHaveTextContent('مفتوح للتسجيل');
    expect(
      getByTestId('group-lifecycle-badge-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('نشطة');
    expect(
      getByTestId('group-recitation-day-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('الجمعة');
    expect(
      getByTestId('group-gender-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('ذكور (بنين)');
    expect(
      getByTestId('group-teacher-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('الشيخ محمد المنصوري');
    expect(
      getByTestId('group-assistant-11111111-1111-1111-1111-111111111111'),
    ).toHaveTextContent('الأستاذ أحمد التونسي');

    // Group 2 assertions
    expect(
      getByTestId('group-row-22222222-2222-2222-2222-222222222222'),
    ).toBeTruthy();
    expect(
      getByTestId('group-name-22222222-2222-2222-2222-222222222222'),
    ).toHaveTextContent('حلقة النور والهدى');
    expect(
      getByTestId(
        'group-enrollment-badge-22222222-2222-2222-2222-222222222222',
      ),
    ).toHaveTextContent('مغلق للتسجيل');
    expect(
      getByTestId('group-lifecycle-badge-22222222-2222-2222-2222-222222222222'),
    ).toHaveTextContent('مؤرشفة');
    expect(
      getByTestId('group-recitation-day-22222222-2222-2222-2222-222222222222'),
    ).toHaveTextContent('الثلاثاء');
    expect(
      getByTestId('group-gender-22222222-2222-2222-2222-222222222222'),
    ).toHaveTextContent('إناث (بنات)');
    expect(
      getByTestId('group-teacher-22222222-2222-2222-2222-222222222222'),
    ).toHaveTextContent('غير محدد');
  });

  it('renders empty state when listGroups returns empty array', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: [],
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );

    expect(await findByText('لا توجد حلقات بعد')).toBeTruthy();
    expect(getByTestId('groups-list-empty')).toBeTruthy();
    expect(getByTestId('empty-state-create-button')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();
    expect(queryByTestId('groups-list-skeleton')).toBeNull();
  });

  it('renders error banner when API fails with ApiError and recovers upon retry', async () => {
    jest
      .spyOn(groupsApi, 'listGroups')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'خطأ في جلب بيانات الحلقات',
        }),
      )
      .mockResolvedValueOnce({
        data: mockGroups,
      });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );

    expect(await findByText('خطأ في جلب بيانات الحلقات')).toBeTruthy();
    expect(getByTestId('groups-list-error')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();

    // Click retry
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(queryByTestId('groups-list-error')).toBeNull();
    expect(getByTestId('groups-list-content')).toBeTruthy();
    expect(groupsApi.listGroups).toHaveBeenCalledTimes(2);
  });

  it('renders generic network error when API fails with non-ApiError', async () => {
    jest
      .spyOn(groupsApi, 'listGroups')
      .mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId, findByText } = render(<GroupsListScreen />);

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('groups-list-error')).toBeTruthy();
  });

  it('navigates to group detail when tapping a group row', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: mockGroups,
    });

    const { getByTestId, findByText } = render(<GroupsListScreen />);

    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        getByTestId('group-row-11111111-1111-1111-1111-111111111111'),
      );
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/admin/groups/[id]',
      params: { id: '11111111-1111-1111-1111-111111111111' },
    });
  });

  it('navigates to create group when tapping the header CTA button', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: mockGroups,
    });

    const { getByTestId } = render(<GroupsListScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('create-group-header-button'));
    });

    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups/create');
  });

  it('navigates to create group when tapping the empty state CTA button', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: [],
    });

    const { getByTestId, findByText } = render(<GroupsListScreen />);

    expect(await findByText('لا توجد حلقات بعد')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('empty-state-create-button'));
    });

    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups/create');
  });
});
