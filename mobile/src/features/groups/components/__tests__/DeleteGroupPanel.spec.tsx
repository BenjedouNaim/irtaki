import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import { DeleteGroupPanel } from '../DeleteGroupPanel';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('DeleteGroupPanel (Figma SCR-29 Danger card + Delete confirm)', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the danger row with the available copy and the small destructive button', () => {
    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    expect(screen.getByTestId('delete-group-panel')).toBeTruthy();
    expect(screen.getByText('حذف المجموعة نهائيًا')).toBeTruthy();
    expect(screen.getByTestId('delete-group-description')).toHaveTextContent(
      'الحذف نهائي ولا يمكن التراجع عنه — ممكن فقط لمجموعة لم ينضم إليها أحد قط.',
    );
    expect(screen.getByTestId('delete-group-button')).toBeTruthy();
    expect(screen.getByText('حذف')).toBeTruthy();
  });

  it('opens the strong confirmation naming the group and hard-deletes on confirm', async () => {
    const onDeletedMock = jest.fn();
    const deleteGroupSpy = jest
      .spyOn(groupsApi, 'deleteGroup')
      .mockResolvedValueOnce(undefined);

    render(
      <DeleteGroupPanel
        groupId={mockGroupId}
        groupName="حلقة الرحمة"
        onDeleted={onDeletedMock}
      />,
    );

    fireEvent.press(screen.getByTestId('delete-group-button'));

    expect(screen.getByTestId('delete-group-confirm-dialog')).toBeTruthy();
    expect(screen.getByText('حذف حلقة الرحمة نهائيًا؟')).toBeTruthy();
    expect(
      screen.getByText(
        'لا يمكن التراجع عن هذا الإجراء. تُحذف المجموعة من القاعدة بالكامل.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('حذف نهائيًا')).toBeTruthy();

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('delete-group-confirm-dialog-confirm-button'),
      );
    });

    expect(deleteGroupSpy).toHaveBeenCalledWith(mockGroupId);
    expect(onDeletedMock).toHaveBeenCalled();
  });

  it('closes confirmation modal when cancel button is pressed without calling deleteGroup', () => {
    const deleteGroupSpy = jest.spyOn(groupsApi, 'deleteGroup');

    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-group-button'));
    expect(screen.getByTestId('delete-group-confirm-dialog')).toBeTruthy();

    fireEvent.press(
      screen.getByTestId('delete-group-confirm-dialog-cancel-button'),
    );

    expect(deleteGroupSpy).not.toHaveBeenCalled();
  });

  it('turns the action unavailable with the Figma copy when 409 GROUP_HAS_HISTORY is returned', async () => {
    jest.spyOn(groupsApi, 'deleteGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'GROUP_HAS_HISTORY',
        message: 'لا يمكن حذف حلقة سبق أن انضم إليها طلاب',
      }),
    );

    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-group-button'));

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('delete-group-confirm-dialog-confirm-button'),
      );
    });

    expect(screen.getByTestId('delete-group-error')).toBeTruthy();
    expect(
      screen.getByText('لا يمكن حذف مجموعة سبق أن انضم إليها طلاب'),
    ).toBeTruthy();
    expect(screen.getByTestId('delete-group-description')).toHaveTextContent(
      'غير متاح — للمجموعة سجل عضويات. الحذف ممكن فقط لمجموعة لم ينضم إليها أحد قط.',
    );
  });

  it('displays generic error banner when API fails with 500 error', async () => {
    jest.spyOn(groupsApi, 'deleteGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'حدث خطأ في الخادم أثناء حذف الحلقة',
      }),
    );

    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    fireEvent.press(screen.getByTestId('delete-group-button'));

    await act(async () => {
      fireEvent.press(
        screen.getByTestId('delete-group-confirm-dialog-confirm-button'),
      );
    });

    expect(screen.getByTestId('delete-group-error')).toBeTruthy();
    expect(screen.getByText('حدث خطأ في الخادم أثناء حذف الحلقة')).toBeTruthy();
  });
});
