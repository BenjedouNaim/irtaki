import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ConfirmationDialog } from '../ConfirmationDialog';

describe('ConfirmationDialog Component', () => {
  const onConfirmMock = jest.fn();
  const onCancelMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, message, and action buttons when visible', async () => {
    await render(
      <ConfirmationDialog
        visible={true}
        title="تأكيد أرشفة الحلقة"
        message="هل أنت متأكد من رغبتك في أرشفة هذه الحلقة؟"
        confirmLabel="أرشفة"
        cancelLabel="تراجع"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    expect(screen.getByText('تأكيد أرشفة الحلقة')).toBeTruthy();
    expect(
      screen.getByText('هل أنت متأكد من رغبتك في أرشفة هذه الحلقة؟'),
    ).toBeTruthy();
    expect(screen.getByText('أرشفة')).toBeTruthy();
    expect(screen.getByText('تراجع')).toBeTruthy();
  });

  it('calls onConfirm when confirm button is pressed', async () => {
    await render(
      <ConfirmationDialog
        visible={true}
        title="تأكيد"
        message="رسالة"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    fireEvent.press(screen.getByTestId('confirmation-dialog-confirm-button'));
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
    expect(onCancelMock).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button is pressed', async () => {
    await render(
      <ConfirmationDialog
        visible={true}
        title="تأكيد"
        message="رسالة"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    fireEvent.press(screen.getByTestId('confirmation-dialog-cancel-button'));
    expect(onCancelMock).toHaveBeenCalledTimes(1);
    expect(onConfirmMock).not.toHaveBeenCalled();
  });

  it('calls onCancel when backdrop is pressed while not loading', async () => {
    await render(
      <ConfirmationDialog
        visible={true}
        title="تأكيد"
        message="رسالة"
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    fireEvent.press(screen.getByTestId('confirmation-dialog-backdrop'));
    expect(onCancelMock).toHaveBeenCalledTimes(1);
  });

  it('disables cancel and backdrop press when loading', async () => {
    await render(
      <ConfirmationDialog
        visible={true}
        title="تأكيد"
        message="رسالة"
        loading={true}
        onConfirm={onConfirmMock}
        onCancel={onCancelMock}
      />,
    );

    fireEvent.press(screen.getByTestId('confirmation-dialog-backdrop'));
    expect(onCancelMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('confirmation-dialog-cancel-button'));
    expect(onCancelMock).not.toHaveBeenCalled();
  });
});
