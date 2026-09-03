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
  router: { back: jest.fn() },
}));

describe('GroupsListScreen (SCR-27 / F-GRP-10, Figma 39:106)', () => {
  const ACTIVE_ID = '11111111-1111-1111-1111-111111111111';
  const ARCHIVED_ID = '22222222-2222-2222-2222-222222222222';

  const mockGroups: groupsApi.GroupListItemFull[] = [
    {
      id: ACTIVE_ID,
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
      id: ARCHIVED_ID,
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

  it('renders the loading skeleton under the head, search and chips on initial mount', async () => {
    jest
      .spyOn(groupsApi, 'listGroups')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId, queryByTestId } = render(<GroupsListScreen />);

    expect(getByTestId('groups-list-top-bar-title').props.children).toBe(
      'المجموعات',
    );
    expect(getByTestId('create-group-header-button')).toBeTruthy();
    expect(getByTestId('groups-list-search')).toBeTruthy();
    expect(
      getByTestId('groups-filter-all').props.accessibilityState.selected,
    ).toBe(true);
    expect(getByTestId('groups-list-skeleton')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();
    expect(queryByTestId('groups-list-empty')).toBeNull();
    expect(queryByTestId('groups-list-error')).toBeNull();
  });

  it('renders one ListRow per group: name, day · gender · staff subtitle and a single state badge', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: mockGroups,
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );

    expect(getByTestId('groups-list-screen')).toBeTruthy();
    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(queryByTestId('groups-list-skeleton')).toBeNull();
    expect(getByTestId('groups-list-count').props.children).toBe(
      'مجموعتان · الأحدث أولًا',
    );

    expect(getByTestId(`group-row-${ACTIVE_ID}-title`)).toHaveTextContent(
      'حلقة الإمام قالون النموذجية',
    );
    expect(getByTestId(`group-row-${ACTIVE_ID}-subtitle`)).toHaveTextContent(
      'الجمعة · ذكور · الشيخ محمد المنصوري / الأستاذ أحمد التونسي',
    );
    expect(getByTestId(`group-row-${ACTIVE_ID}-badge`)).toHaveTextContent(
      'نشطة',
    );

    expect(getByTestId(`group-row-${ARCHIVED_ID}-title`)).toHaveTextContent(
      'حلقة النور والهدى',
    );
    expect(getByTestId(`group-row-${ARCHIVED_ID}-subtitle`)).toHaveTextContent(
      'الثلاثاء · إناث · —',
    );
    expect(getByTestId(`group-row-${ARCHIVED_ID}-badge`)).toHaveTextContent(
      'مؤرشفة',
    );
  });

  it('shows "التسجيل مغلق" as the badge of an active group whose enrollment is closed', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: [{ ...mockGroups[0], enrollment_status: 'Closed' }],
    });

    const { findByTestId } = render(<GroupsListScreen />);

    expect(
      await findByTestId(`group-row-${ACTIVE_ID}-badge`),
    ).toHaveTextContent('التسجيل مغلق');
  });

  it('renders the empty state with the create CTA when listGroups returns an empty array', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: [],
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );

    expect(await findByText('لا توجد مجموعات بعد')).toBeTruthy();
    expect(getByTestId('groups-list-empty')).toBeTruthy();
    expect(getByTestId('empty-state-create-button')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();
    expect(queryByTestId('groups-list-skeleton')).toBeNull();
  });

  it('filters on the device by search text and lifecycle chips, with the filtered-empty state', async () => {
    jest.spyOn(groupsApi, 'listGroups').mockResolvedValueOnce({
      data: mockGroups,
    });

    const { getByTestId, findByText, queryByTestId } = render(
      <GroupsListScreen />,
    );
    await findByText('حلقة الإمام قالون النموذجية');

    fireEvent.press(getByTestId('groups-filter-archived'));
    expect(queryByTestId(`group-row-${ACTIVE_ID}`)).toBeNull();
    expect(getByTestId(`group-row-${ARCHIVED_ID}`)).toBeTruthy();

    fireEvent.press(getByTestId('groups-filter-active'));
    expect(getByTestId(`group-row-${ACTIVE_ID}`)).toBeTruthy();
    expect(queryByTestId(`group-row-${ARCHIVED_ID}`)).toBeNull();

    fireEvent.press(getByTestId('groups-filter-all'));
    fireEvent.changeText(getByTestId('groups-list-search'), 'النور');
    expect(queryByTestId(`group-row-${ACTIVE_ID}`)).toBeNull();
    expect(getByTestId(`group-row-${ARCHIVED_ID}`)).toBeTruthy();

    fireEvent.changeText(getByTestId('groups-list-search'), 'لا شيء');
    expect(getByTestId('groups-list-filtered-empty')).toBeTruthy();
    expect(await findByText('لا توجد مجموعات تطابق البحث')).toBeTruthy();
    expect(queryByTestId('groups-list-content')).toBeNull();
    expect(groupsApi.listGroups).toHaveBeenCalledTimes(1);
  });

  it('renders the retry banner when the API fails with ApiError and recovers upon retry', async () => {
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
    expect(getByTestId('groups-list-error').props.accessibilityRole).toBe(
      'alert',
    );
    expect(queryByTestId('groups-list-content')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('groups-list-error-retry-button'));
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
      fireEvent.press(getByTestId(`group-row-${ACTIVE_ID}`));
    });

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/admin/groups/[id]',
      params: { id: ACTIVE_ID },
    });
  });

  it('navigates to create group when tapping the add pill', async () => {
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

    expect(await findByText('لا توجد مجموعات بعد')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('empty-state-create-button'));
    });

    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups/create');
  });
});
