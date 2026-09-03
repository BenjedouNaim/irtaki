import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import { GroupLifecyclePanel } from '../GroupLifecyclePanel';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('GroupLifecyclePanel (Figma SCR-29 Lifecycle card + Archive confirm)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  const mockGroup: groupsApi.GroupListItemFull = {
    id: mockGroupId,
    name: 'حلقة قالون',
    gender: 'Male',
    recitation_day: 5,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: {
      id: 'teacher-1',
      full_name: 'الشيخ محمد',
    },
    assistant: {
      id: 'assistant-1',
      full_name: 'الأستاذ أحمد',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the archive row when the group is Active', () => {
    render(
      <GroupLifecyclePanel
        groupId={mockGroupId}
        lifecycleState="Active"
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByTestId('group-lifecycle-panel')).toBeTruthy();
    expect(screen.getByText('دورة الحياة')).toBeTruthy();
    expect(screen.getByText('أرشفة المجموعة')).toBeTruthy();
    expect(
      screen.getByText(
        'ترفض الطلبات المعلّقة، توقف التقارير والدفع. قابلة للعكس.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('أرشفة')).toBeTruthy();
  });

  it('renders the un-archive row when the group is Archived', () => {
    render(
      <GroupLifecyclePanel
        groupId={mockGroupId}
        lifecycleState="Archived"
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText('المجموعة مؤرشفة')).toBeTruthy();
    expect(screen.getByText('إلغاء الأرشفة')).toBeTruthy();
  });

  it('opens the standard confirmation naming the group and archives on confirm', async () => {
    const onChangedMock = jest.fn();
    const updatedGroup: groupsApi.GroupListItemFull = {
      ...mockGroup,
      lifecycle_state: 'Archived',
    };

    const setLifecycleSpy = jest
      .spyOn(groupsApi, 'setGroupLifecycle')
      .mockResolvedValueOnce({
        data: updatedGroup,
      });

    render(
      <GroupLifecyclePanel
        groupId={mockGroupId}
        lifecycleState="Active"
        groupName="حلقة قالون"
        onChanged={onChangedMock}
      />,
    );

    fireEvent.press(screen.getByTestId('toggle-lifecycle-button'));

    expect(screen.getByTestId('lifecycle-confirm-dialog')).toBeTruthy();
    expect(screen.getByText('أرشفة حلقة قالون؟')).toBeTruthy();
    expect(
      screen.getByText(
        'تُرفض الطلبات المعلّقة تلقائيًا، وتتوقف التقارير والدفع. يمكن إلغاء الأرشفة لاحقًا، لكن الطلبات المرفوضة لا تعود.',
      ),
    ).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('lifecycle-confirm-dialog-confirm-button'),
      );
    });

    expect(setLifecycleSpy).toHaveBeenCalledWith(mockGroupId, 'Archived');
    expect(onChangedMock).toHaveBeenCalledWith(updatedGroup);
  });

  it('opens confirmation modal and un-archives group on confirm', async () => {
    const onChangedMock = jest.fn();
    const updatedGroup: groupsApi.GroupListItemFull = {
      ...mockGroup,
      lifecycle_state: 'Active',
    };

    const setLifecycleSpy = jest
      .spyOn(groupsApi, 'setGroupLifecycle')
      .mockResolvedValueOnce({
        data: updatedGroup,
      });

    render(
      <GroupLifecyclePanel
        groupId={mockGroupId}
        lifecycleState="Archived"
        onChanged={onChangedMock}
      />,
    );

    fireEvent.press(screen.getByTestId('toggle-lifecycle-button'));

    expect(screen.getByTestId('lifecycle-confirm-dialog')).toBeTruthy();
    expect(screen.getByText('إلغاء أرشفة المجموعة؟')).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('lifecycle-confirm-dialog-confirm-button'),
      );
    });

    expect(setLifecycleSpy).toHaveBeenCalledWith(mockGroupId, 'Active');
    expect(onChangedMock).toHaveBeenCalledWith(updatedGroup);
  });

  it('displays the error banner when setGroupLifecycle fails', async () => {
    jest.spyOn(groupsApi, 'setGroupLifecycle').mockRejectedValueOnce(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'حدث خطأ في الخادم أثناء الأرشفة',
      }),
    );

    render(
      <GroupLifecyclePanel
        groupId={mockGroupId}
        lifecycleState="Active"
        onChanged={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('toggle-lifecycle-button'));

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('lifecycle-confirm-dialog-confirm-button'),
      );
    });

    expect(screen.getByTestId('group-lifecycle-error')).toBeTruthy();
    expect(screen.getByText('حدث خطأ في الخادم أثناء الأرشفة')).toBeTruthy();
  });
});
