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
}));

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/users.client');

describe('GroupDetailScreen (SCR-29)', () => {
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
    jest.spyOn(usersApi, 'listUsersByRole').mockResolvedValue({ data: [] });
  });

  it('renders loading skeleton on initial mount', async () => {
    jest
      .spyOn(groupsApi, 'getGroupDetail')
      .mockImplementation(() => new Promise(() => {})); // Never resolves

    const { getByTestId } = render(<GroupDetailScreen groupId={mockGroupId} />);

    expect(getByTestId('group-detail-skeleton')).toBeTruthy();
  });

  it('renders full group details successfully when API succeeds', async () => {
    jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
      data: mockGroupDetail,
    });

    const { getByTestId, findByText } = render(
      <GroupDetailScreen groupId={mockGroupId} />,
    );

    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(getByTestId('group-detail-name')).toBeTruthy();
    expect(getByTestId('group-detail-enrollment-badge')).toBeTruthy();
    expect(getByTestId('group-detail-lifecycle-badge')).toBeTruthy();

    expect(getByTestId('group-detail-recitation-day')).toHaveTextContent(
      'الجمعة',
    );
    expect(getByTestId('group-detail-gender')).toHaveTextContent('ذكور (بنين)');
    expect(getByTestId('group-detail-teacher')).toHaveTextContent(
      'الشيخ محمد المنصوري',
    );
    expect(getByTestId('group-detail-assistant')).toHaveTextContent(
      'الأستاذ أحمد التونسي',
    );
    expect(getByTestId('group-detail-riwaya')).toHaveTextContent(
      'قالون عن نافع',
    );
  });

  it('renders error banner when API fails and retries upon pressing retry', async () => {
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

    // Click retry
    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    // Should fetch again and display the details
    expect(await findByText('حلقة الإمام قالون النموذجية')).toBeTruthy();
    expect(groupsApi.getGroupDetail).toHaveBeenCalledTimes(2);
  });

  describe('Inline Rename (F-GRP-05)', () => {
    it('enters edit mode when pressing edit button, prefilling current name', async () => {
      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId, getByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      const editBtn = await findByTestId('group-detail-name-edit-button');
      fireEvent.press(editBtn);

      const input = getByTestId('group-detail-name-input');
      expect(input.props.value).toBe('حلقة الإمام قالون النموذجية');
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

      const cancelBtn = getByTestId('group-detail-name-cancel');
      fireEvent.press(cancelBtn);

      expect(queryByTestId('group-detail-name-input')).toBeNull();
      expect(getByTestId('group-detail-name')).toHaveTextContent(
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

      const input = getByTestId('group-detail-name-input');
      fireEvent.changeText(input, '   ');

      const saveBtn = getByTestId('group-detail-name-save');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(getByTestId('group-detail-name-error')).toHaveTextContent(
        'اسم الحلقة مطلوب',
      );
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('successfully renames group, updates displayed name, exits edit mode, and shows success banner', async () => {
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

      const input = getByTestId('group-detail-name-input');
      fireEvent.changeText(input, '  حلقة الإمام نافع المدني  ');

      const saveBtn = getByTestId('group-detail-name-save');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(updateSpy).toHaveBeenCalledWith(mockGroupId, {
        name: 'حلقة الإمام نافع المدني',
      });
      expect(queryByTestId('group-detail-name-input')).toBeNull();
      expect(getByTestId('group-detail-name')).toHaveTextContent(
        'حلقة الإمام نافع المدني',
      );
      expect(getByTestId('group-detail-success-banner')).toBeTruthy();
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

      const input = getByTestId('group-detail-name-input');
      fireEvent.changeText(input, 'حلقة مكررة');

      const saveBtn = getByTestId('group-detail-name-save');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(getByTestId('group-detail-name-error')).toHaveTextContent(
        'اسم الحلقة مستخدم بالفعل',
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

      const input = getByTestId('group-detail-name-input');
      fireEvent.changeText(input, 'اسم غير صالح');

      const saveBtn = getByTestId('group-detail-name-save');
      await act(async () => {
        fireEvent.press(saveBtn);
      });

      expect(getByTestId('group-detail-name-error')).toHaveTextContent(
        'اسم الحلقة يحتوي على أحرف غير مسموح بها',
      );
    });
  });

  describe('Staff Reassignment Panel (F-GRP-07)', () => {
    it('renders StaffReassignmentPanel when user role is Admin', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('staff-reassignment-panel')).toBeTruthy();
    });

    it('does not render StaffReassignmentPanel when user role is Student', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-name');
      expect(queryByTestId('staff-reassignment-panel')).toBeNull();
    });
  });

  describe('Group Lifecycle Panel (F-GRP-08)', () => {
    it('renders GroupLifecyclePanel when user role is Admin', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
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
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Teacher' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-name');
      expect(queryByTestId('group-lifecycle-panel')).toBeNull();
    });
  });

  describe('Delete Group Panel (F-GRP-09)', () => {
    it('renders DeleteGroupPanel when user role is Admin', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
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
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Teacher' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-name');
      expect(queryByTestId('delete-group-panel')).toBeNull();
    });

    it('does not render DeleteGroupPanel when user role is Student', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-name');
      expect(queryByTestId('delete-group-panel')).toBeNull();
    });
  });

  describe('Group Roster Link (F-MEM-02)', () => {
    it('renders the roster button when user role is Admin', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Admin' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      expect(await findByTestId('group-detail-roster-button')).toBeTruthy();
    });

    it('navigates to the group roster screen with the group id when pressed', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
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
        params: { id: mockGroupId },
      });
    });

    it('does not render the roster button when user role is Student', async () => {
      const { useAuthStore } = require('@/shared/auth/authStore');
      useAuthStore.setState({ role: 'Student' });

      jest.spyOn(groupsApi, 'getGroupDetail').mockResolvedValueOnce({
        data: mockGroupDetail,
      });

      const { queryByTestId, findByTestId } = render(
        <GroupDetailScreen groupId={mockGroupId} />,
      );

      await findByTestId('group-detail-name');
      expect(queryByTestId('group-detail-roster-button')).toBeNull();
    });
  });
});
