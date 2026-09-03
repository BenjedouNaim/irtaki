import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { GroupDetailScreen } from '../GroupDetailScreen';
import * as groupsApi from '@/shared/api/groups.client';
import * as usersApi from '@/shared/api/users.client';
import { useAuthStore } from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  router: { back: jest.fn() },
}));

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/users.client');

/** The single-page `GET /users` envelope the staff picker reads (APIS §9.2). */
const NO_MORE = { next_cursor: null, has_more: false };

describe('GroupDetailScreen (SCR-29, Figma 41:207 / 52:797)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockGroupDetail: groupsApi.GroupListItemFull = {
    id: mockGroupId,
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
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ role: 'Admin' });
    jest
      .spyOn(usersApi, 'listUsersByRole')
      .mockResolvedValue({ data: [], pagination: NO_MORE });
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(groupsApi, 'getGroupDetail')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId } = render(<GroupDetailScreen groupId={mockGroupId} />);

    expect(getByTestId('group-detail-skeleton')).toBeTruthy();
  });

  it('renders the group as the title, the meta line, both badges, the staff card and the roster row', async () => {
    jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
      data: mockGroupDetail,
    });

    const { getByTestId, findByTestId, queryByTestId } = render(
      <GroupDetailScreen groupId={mockGroupId} />,
    );

    const title = await findByTestId('group-detail-top-bar-title');
    expect(title.props.children).toBe('حلقة الإمام قالون النموذجية');
    expect(getByTestId('group-detail-meta').props.children).toBe(
      'الجمعة · ذكور',
    );
    expect(getByTestId('group-detail-enrollment-badge')).toHaveTextContent(
      'التسجيل مفتوح',
    );
    expect(getByTestId('group-detail-lifecycle-badge')).toHaveTextContent(
      'نشطة',
    );
    expect(getByTestId('staff-current-teacher')).toHaveTextContent(
      'الشيخ محمد المنصوري',
    );
    expect(getByTestId('staff-current-assistant')).toHaveTextContent(
      'الأستاذ أحمد التونسي',
    );
    expect(getByTestId('group-detail-roster-button')).toHaveTextContent(
      'قائمة الطلاب',
    );
    // Performance is not built — no "الأداء والتقارير" row.
    expect(queryByTestId('group-detail-performance-button')).toBeNull();
  });

  it('renders the retry banner when the API fails and retries upon pressing retry', async () => {
    jest
      .spyOn(groupsApi, 'getGroupDetail')
      .mockRejectedValueOnce(
        new ApiError({
          statusCode: 403,
          error: 'Forbidden',
          message: 'غير مصرح لك بالوصول إلى هذه الحلقة',
        }),
      )
      .mockResolvedValueOnce({
        data: mockGroupDetail,
      });

    const { getByTestId, findByText } = render(
      <GroupDetailScreen groupId={mockGroupId} />,
    );

    expect(await findByText('غير مصرح لك بالوصول إلى هذه الحلقة')).toBeTruthy();
    expect(getByTestId('group-detail-error')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('group-detail-error-retry-button'));
    });

    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(groupsApi.getGroupDetail).toHaveBeenCalledTimes(2);
  });

  describe('Inline Rename (F-GRP-05, Figma 52:797)', () => {
    it('enters edit mode from the rename pill: title flips, input prefilled, save/cancel shown', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId, getByTestId, getByText } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      expect(getByTestId('group-detail-top-bar-title').props.children).toBe(
        'تعديل الاسم',
      );
      const input = getByTestId('group-detail-name-input');
      expect(input.props.value).toBe('حلقة الإمام قالون النموذجية');
      expect(
        getByText('يجب أن يكون فريدًا · الحقل الوحيد القابل للتعديل'),
      ).toBeTruthy();
      expect(getByTestId('group-detail-name-save')).toBeTruthy();
      expect(getByTestId('group-detail-name-cancel')).toBeTruthy();
    });

    it('cancels editing and restores original name without calling updateGroupName', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });
      const updateSpy = jest.spyOn(groupsApi, 'updateGroupName');

      const { findByTestId, getByTestId, queryByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      const input = getByTestId('group-detail-name-input');
      fireEvent.changeText(input, 'اسم تم تغييره');

      fireEvent.press(getByTestId('group-detail-name-cancel'));

      expect(queryByTestId('group-detail-name-input')).toBeNull();
      expect(getByTestId('group-detail-top-bar-title').props.children).toBe(
        'حلقة الإمام قالون النموذجية',
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('validates empty name on client side and prevents API call', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });
      const updateSpy = jest.spyOn(groupsApi, 'updateGroupName');

      const { findByTestId, getByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      fireEvent.changeText(getByTestId('group-detail-name-input'), '   ');

      await act(async () => {
        fireEvent.press(getByTestId('group-detail-name-save'));
      });

      expect(getByTestId('form-field-error')).toHaveTextContent(
        'اسم المجموعة مطلوب',
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('successfully renames group, updates the title, exits edit mode, and shows the success toast', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });
      const updatedGroup: groupsApi.GroupListItemFull = {
        ...mockGroupDetail,
        name: 'حلقة الإمام نافع المدني',
      };
      const updateSpy = jest
        .spyOn(groupsApi, 'updateGroupName')
        .mockResolvedValueOnce({
          data: updatedGroup,
        });

      const { findByTestId, getByTestId, queryByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      fireEvent.changeText(
        getByTestId('group-detail-name-input'),
        '  حلقة الإمام نافع المدني  ',
      );

      await act(async () => {
        fireEvent.press(getByTestId('group-detail-name-save'));
      });

      expect(updateSpy).toHaveBeenCalledWith(mockGroupId, {
        name: 'حلقة الإمام نافع المدني',
      });
      expect(queryByTestId('group-detail-name-input')).toBeNull();
      expect(getByTestId('group-detail-top-bar-title').props.children).toBe(
        'حلقة الإمام نافع المدني',
      );
      expect(getByTestId('group-detail-success-banner')).toHaveTextContent(
        'تم تحديث اسم المجموعة',
      );
    });

    it('shows inline error and stays in edit mode when duplicate name 409 is returned', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });
      jest.spyOn(groupsApi, 'updateGroupName').mockRejectedValueOnce(
        new ApiError({
          statusCode: 409,
          error: 'GROUP_NAME_TAKEN',
          message: 'اسم الحلقة مستخدم بالفعل',
        }),
      );

      const { findByTestId, getByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      fireEvent.changeText(
        getByTestId('group-detail-name-input'),
        'حلقة مكررة',
      );

      await act(async () => {
        fireEvent.press(getByTestId('group-detail-name-save'));
      });

      expect(getByTestId('form-field-error')).toHaveTextContent(
        'اسم المجموعة مستخدم بالفعل',
      );
      expect(getByTestId('group-detail-name-input')).toBeTruthy();
    });

    it('shows inline validation error when 422 with details is returned', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });
      jest.spyOn(groupsApi, 'updateGroupName').mockRejectedValueOnce(
        new ApiError({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'بيانات غير صالحة',
          details: [
            {
              field: 'name',
              rule: 'VR-22',
              message: 'اسم الحلقة يحتوي على أحرف غير مسموح بها',
            },
          ],
        }),
      );

      const { findByTestId, getByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      fireEvent.changeText(
        getByTestId('group-detail-name-input'),
        'اسم غير صالح',
      );

      await act(async () => {
        fireEvent.press(getByTestId('group-detail-name-save'));
      });

      expect(getByTestId('form-field-error')).toHaveTextContent(
        'اسم الحلقة يحتوي على أحرف غير مسموح بها',
      );
    });
  });

  describe('Staff Reassignment Panel (F-GRP-07)', () => {
    it('renders StaffReassignmentPanel when user role is Admin', async () => {
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('staff-reassignment-panel')).toBeTruthy();
    });

    it('does not render StaffReassignmentPanel nor the rename pill when user role is Student', async () => {
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-meta');
      expect(queryByTestId('staff-reassignment-panel')).toBeNull();
      expect(queryByTestId('group-detail-name-edit-button')).toBeNull();
    });
  });

  describe('Group Lifecycle Panel (F-GRP-08)', () => {
    it('renders GroupLifecyclePanel when user role is Admin', async () => {
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('group-lifecycle-panel')).toBeTruthy();
    });

    it('does not render GroupLifecyclePanel when user role is Teacher', async () => {
      useAuthStore.setState({ role: 'Teacher' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-meta');
      expect(queryByTestId('group-lifecycle-panel')).toBeNull();
      expect(queryByTestId('enrollment-toggle')).toBeTruthy();
    });
  });

  describe('Delete Group Panel (F-GRP-09)', () => {
    it('renders DeleteGroupPanel when user role is Admin', async () => {
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('delete-group-panel')).toBeTruthy();
    });

    it('does not render DeleteGroupPanel when user role is Teacher', async () => {
      useAuthStore.setState({ role: 'Teacher' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-meta');
      expect(queryByTestId('delete-group-panel')).toBeNull();
    });

    it('does not render DeleteGroupPanel when user role is Student', async () => {
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-meta');
      expect(queryByTestId('delete-group-panel')).toBeNull();
    });
  });

  describe('Group Roster Link (F-MEM-02)', () => {
    it('renders the roster row when user role is Admin', async () => {
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('group-detail-roster-button')).toBeTruthy();
    });

    it('navigates to the group roster screen with the group id and name when pressed', async () => {
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const rosterButton = await findByTestId('group-detail-roster-button');

      await act(async () => {
        fireEvent.press(rosterButton);
      });

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/admin/groups/[id]/roster',
        params: { id: mockGroupId, name: 'حلقة الإمام قالون النموذجية' },
      });
    });

    it('does not render the roster row when user role is Student', async () => {
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-meta');
      expect(queryByTestId('group-detail-roster-button')).toBeNull();
    });
  });
});
