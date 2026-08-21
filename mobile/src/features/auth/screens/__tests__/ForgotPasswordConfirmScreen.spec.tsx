import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ForgotPasswordConfirmScreen } from '../ForgotPasswordConfirmScreen';
import * as authApi from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/auth.client');

describe('ForgotPasswordConfirmScreen (SCR-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders password input and submit button when token is provided', async () => {
    const { getByText, getByTestId } = await render(
      <ForgotPasswordConfirmScreen token="valid-reset-token" />,
    );

    expect(getByText('إرتقِ')).toBeTruthy();
    expect(getByText('تعيين كلمة مرور جديدة')).toBeTruthy();
    expect(getByTestId('forgot-password-confirm-password-input')).toBeTruthy();
    expect(getByTestId('forgot-password-confirm-submit-button')).toBeTruthy();
  });

  it('renders dead-end invalid link state when token is missing or empty', async () => {
    const onNavigateToRequest = jest.fn();
    const { getByText, getByTestId, queryByTestId } = await render(
      <ForgotPasswordConfirmScreen
        token=""
        onNavigateToRequest={onNavigateToRequest}
      />,
    );

    expect(getByText('الرابط غير صالح أو منتهي الصلاحية')).toBeTruthy();
    expect(getByTestId('forgot-password-invalid-token-state')).toBeTruthy();
    expect(queryByTestId('forgot-password-confirm-password-input')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-request-new-link-button'));
    });

    expect(onNavigateToRequest).toHaveBeenCalledTimes(1);
  });

  it('shows error when submitting empty password', async () => {
    const { getByTestId, findByText } = await render(
      <ForgotPasswordConfirmScreen token="valid-reset-token" />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(await findByText('كلمة المرور مطلوبة')).toBeTruthy();
  });

  it('shows error when password is less than 8 characters', async () => {
    const { getByTestId, findByText } = await render(
      <ForgotPasswordConfirmScreen token="valid-reset-token" />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-confirm-password-input'),
        'short',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(
      await findByText('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'),
    ).toBeTruthy();
  });

  it('successfully confirms password reset and invokes onSuccess callback on 200 response', async () => {
    jest.spyOn(authApi, 'confirmPasswordReset').mockResolvedValueOnce({
      message: 'تم تغيير كلمة المرور بنجاح',
    });

    const onSuccess = jest.fn();
    const { getByTestId } = await render(
      <ForgotPasswordConfirmScreen
        token="valid-reset-token"
        onSuccess={onSuccess}
      />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-confirm-password-input'),
        'NewStrongPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(authApi.confirmPasswordReset).toHaveBeenCalledWith({
      token: 'valid-reset-token',
      new_password: 'NewStrongPassword123!',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('handles 400 INVALID_OR_EXPIRED_TOKEN by displaying dead-end state with CTA', async () => {
    jest.spyOn(authApi, 'confirmPasswordReset').mockRejectedValueOnce(
      new ApiError({
        statusCode: 400,
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      }),
    );

    const onNavigateToRequest = jest.fn();
    const { getByTestId, findByText } = await render(
      <ForgotPasswordConfirmScreen
        token="expired-token"
        onNavigateToRequest={onNavigateToRequest}
      />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-confirm-password-input'),
        'NewStrongPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(await findByText('الرابط غير صالح أو منتهي الصلاحية')).toBeTruthy();
    expect(getByTestId('forgot-password-invalid-token-state')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-request-new-link-button'));
    });
    expect(onNavigateToRequest).toHaveBeenCalledTimes(1);
  });

  it('handles 422 validation errors from backend', async () => {
    jest.spyOn(authApi, 'confirmPasswordReset').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة البيانات',
        details: [
          {
            field: 'new_password',
            message: 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل',
          },
        ],
      }),
    );

    const { getByTestId, findByText } = await render(
      <ForgotPasswordConfirmScreen token="valid-token" />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-confirm-password-input'),
        'ValidPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(
      await findByText('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'),
    ).toBeTruthy();
  });

  it('handles general network failure with error banner', async () => {
    jest
      .spyOn(authApi, 'confirmPasswordReset')
      .mockRejectedValueOnce(new Error('Network disconnected'));

    const { getByTestId, findByText } = await render(
      <ForgotPasswordConfirmScreen token="valid-token" />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-confirm-password-input'),
        'ValidPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-confirm-submit-button'));
    });

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('forgot-password-confirm-general-error')).toBeTruthy();
  });
});
