import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react-native';
import { DeleteGroupPanel } from '../DeleteGroupPanel';
import * as groupsApi from '@/shared/api/groups.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');

describe('DeleteGroupPanel Component', () => {
  const mockGroupId = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders delete group action button and description text', () => {
    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    expect(screen.getByTestId('delete-group-panel')).toBeTruthy();
    expect(screen.getAllByText('حذف الحلقة').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('delete-group-button')).toBeTruthy();
  });

  it('opens confirmation modal on button press and executes hard delete on confirm', async () => {
    const onDeletedMock = jest.fn();
    const deleteGroupSpy = jest
      .spyOn(groupsApi, 'deleteGroup')
      .mockResolvedValueOnce(undefined);

    render(
      <DeleteGroupPanel groupId={mockGroupId} onDeleted={onDeletedMock} />,
    );

    // Press delete button to open confirmation dialog
    fireEvent.press(screen.getByTestId('delete-group-button'));

    expect(screen.getByTestId('delete-group-confirm-dialog')).toBeTruthy();
    expect(screen.getByText('تأكيد حذف الحلقة')).toBeTruthy();
    expect(
      screen.getByText(
        'هل أنت متأكد من رغبتك في حذف هذه الحلقة نهائياً؟ هذا الإجراء لا يمكن التراجع عنه وسيتم حذف بيانات الحلقة بالكامل.',
      ),
    ).toBeTruthy();

    // Confirm deletion
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

    // Press delete button to open dialog
    fireEvent.press(screen.getByTestId('delete-group-button'));
    expect(screen.getByTestId('delete-group-confirm-dialog')).toBeTruthy();

    // Press cancel button
    fireEvent.press(
      screen.getByTestId('delete-group-confirm-dialog-cancel-button'),
    );

    expect(deleteGroupSpy).not.toHaveBeenCalled();
  });

  it('displays specific inline error message when 409 GROUP_HAS_HISTORY is returned', async () => {
    jest.spyOn(groupsApi, 'deleteGroup').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'GROUP_HAS_HISTORY',
        message: 'لا يمكن حذف حلقة سبق أن انضم إليها طلاب',
      }),
    );

    render(<DeleteGroupPanel groupId={mockGroupId} onDeleted={jest.fn()} />);

    // Press delete button to open dialog
    fireEvent.press(screen.getByTestId('delete-group-button'));

    // Confirm
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('delete-group-confirm-dialog-confirm-button'),
      );
    });

    expect(screen.getByTestId('delete-group-error')).toBeTruthy();
    expect(
      screen.getByText('لا يمكن حذف حلقة سبق أن انضم إليها طلاب'),
    ).toBeTruthy();
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

    // Press delete button to open dialog
    fireEvent.press(screen.getByTestId('delete-group-button'));

    // Confirm
    await act(async () => {
      fireEvent.press(
        screen.getByTestId('delete-group-confirm-dialog-confirm-button'),
      );
    });

    expect(screen.getByTestId('delete-group-error')).toBeTruthy();
    expect(screen.getByText('حدث خطأ في الخادم أثناء حذف الحلقة')).toBeTruthy();
  });
});
