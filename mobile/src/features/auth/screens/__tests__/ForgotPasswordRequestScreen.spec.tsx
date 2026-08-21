import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ForgotPasswordRequestScreen } from '../ForgotPasswordRequestScreen';
import * as authApi from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/auth.client');

describe('ForgotPasswordRequestScreen (SCR-03)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders email input, submit button, and screen titles', async () => {
    const { getByText, getByTestId } = await render(
      <ForgotPasswordRequestScreen />,
    );

    expect(getByText('إرتقِ')).toBeTruthy();
    expect(getByText('استعادة كلمة المرور')).toBeTruthy();
    expect(getByTestId('forgot-password-email-input')).toBeTruthy();
    expect(getByTestId('forgot-password-submit-button')).toBeTruthy();
  });

  it('shows error when submitting empty email field', async () => {
    const { getByTestId, findByText } = await render(
      <ForgotPasswordRequestScreen />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني مطلوب')).toBeTruthy();
  });

  it('shows error when email format is invalid', async () => {
    const { getByTestId, findByText } = await render(
      <ForgotPasswordRequestScreen />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-email-input'),
        'invalid-email-format',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني غير صالح')).toBeTruthy();
  });

  it('successfully submits and shows neutral confirmation message on success', async () => {
    jest.spyOn(authApi, 'requestPasswordReset').mockResolvedValueOnce({
      message:
        'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    });

    const onNavigateToLogin = jest.fn();
    const { getByTestId, findByText, queryByTestId } = await render(
      <ForgotPasswordRequestScreen onNavigateToLogin={onNavigateToLogin} />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-email-input'),
        'user@example.com',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-submit-button'));
    });

    expect(authApi.requestPasswordReset).toHaveBeenCalledWith({
      email: 'user@example.com',
    });

    expect(await findByText('تم إرسال التعليمات')).toBeTruthy();
    expect(getByTestId('forgot-password-success-banner')).toBeTruthy();
    expect(queryByTestId('forgot-password-email-input')).toBeNull();

    // Verify back to login button in banner
    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-back-to-login-button'));
    });
    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });

  it('handles 422 validation errors from backend', async () => {
    jest.spyOn(authApi, 'requestPasswordReset').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة البيانات',
        details: [{ field: 'email', message: 'البريد الإلكتروني غير صالح' }],
      }),
    );

    const { getByTestId, findByText } = await render(
      <ForgotPasswordRequestScreen />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-email-input'),
        'user@example.com',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني غير صالح')).toBeTruthy();
  });

  it('handles network failure with error banner', async () => {
    jest
      .spyOn(authApi, 'requestPasswordReset')
      .mockRejectedValueOnce(new Error('Network error'));

    const { getByTestId, findByText } = await render(
      <ForgotPasswordRequestScreen />,
    );

    await act(async () => {
      fireEvent.changeText(
        getByTestId('forgot-password-email-input'),
        'user@example.com',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-submit-button'));
    });

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('forgot-password-general-error')).toBeTruthy();
  });

  it('calls onNavigateToLogin when back link in footer is pressed', async () => {
    const onNavigateToLogin = jest.fn();
    const { getByTestId } = await render(
      <ForgotPasswordRequestScreen onNavigateToLogin={onNavigateToLogin} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('forgot-password-back-link'));
    });

    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
