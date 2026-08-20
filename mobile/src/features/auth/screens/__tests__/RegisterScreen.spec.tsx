import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { RegisterScreen } from '../RegisterScreen';
import * as authApi from '@/shared/api/auth.client';
import { ApiError } from '@/shared/api/types';
import { useAuthStore } from '@/shared/auth/authStore';

jest.mock('@/shared/api/auth.client');
jest.mock('@/shared/auth/authStore', () => {
  const original = jest.requireActual('@/shared/auth/authStore');
  return {
    ...original,
    storeRefreshToken: jest.fn().mockResolvedValue(undefined),
  };
});

describe('RegisterScreen (SCR-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('renders email and password inputs, submit button, and app title', async () => {
    const { getByText, getByTestId } = await render(<RegisterScreen />);

    expect(getByText('إرتقِ')).toBeTruthy();
    expect(getByText('إنشاء حساب جديد')).toBeTruthy();
    expect(getByTestId('register-email-input')).toBeTruthy();
    expect(getByTestId('register-password-input')).toBeTruthy();
    expect(getByTestId('register-submit-button')).toBeTruthy();
  });

  it('shows error when submitting empty fields', async () => {
    const { getByTestId, findByText } = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني مطلوب')).toBeTruthy();
    expect(await findByText('كلمة المرور مطلوبة')).toBeTruthy();
  });

  it('shows error when password is less than 8 characters', async () => {
    const { getByTestId, findByText } = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('register-email-input'),
        'valid@example.com',
      );
      fireEvent.changeText(getByTestId('register-password-input'), 'short');
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    expect(
      await findByText('يجب أن تتكون كلمة المرور من 8 أحرف على الأقل'),
    ).toBeTruthy();
  });

  it('handles 409 EMAIL_TAKEN by displaying inline field error', async () => {
    jest.spyOn(authApi, 'registerUser').mockRejectedValueOnce(
      new ApiError({
        statusCode: 409,
        error: 'EMAIL_TAKEN',
        message: 'البريد الإلكتروني مستخدم بالفعل',
      }),
    );

    const { getByTestId, findByText } = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('register-email-input'),
        'taken@example.com',
      );
      fireEvent.changeText(
        getByTestId('register-password-input'),
        'Password123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني مستخدم بالفعل')).toBeTruthy();
  });

  it('handles 422 validation errors from backend', async () => {
    jest.spyOn(authApi, 'registerUser').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة البيانات',
        details: [{ field: 'password', message: 'كلمة المرور ضعيفة للغاية' }],
      }),
    );

    const { getByTestId, findByText } = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('register-email-input'),
        'user@example.com',
      );
      fireEvent.changeText(
        getByTestId('register-password-input'),
        'Password123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    expect(await findByText('كلمة المرور ضعيفة للغاية')).toBeTruthy();
  });

  it('successfully registers, stores session, and sets auth state on 201 response', async () => {
    jest.spyOn(authApi, 'registerUser').mockResolvedValueOnce({
      id: 'uuid-1234',
      role: 'User',
      email: 'newuser@example.com',
      timezone: 'Africa/Tunis',
      access_token: 'mock-jwt-token',
      refresh_token: 'mock-refresh-token',
    });

    const { getByTestId } = await render(<RegisterScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('register-email-input'),
        'newuser@example.com',
      );
      fireEvent.changeText(
        getByTestId('register-password-input'),
        'ValidPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('register-submit-button'));
    });

    await waitFor(() => {
      expect(authApi.registerUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        password: 'ValidPassword123!',
        timezone: expect.any(String),
      });
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.accessToken).toBe('mock-jwt-token');
      expect(state.role).toBe('User');
    });
  });

  it('calls onNavigateToLogin when login footer link is pressed', async () => {
    const onNavigateToLogin = jest.fn();
    const { getByTestId } = await render(
      <RegisterScreen onNavigateToLogin={onNavigateToLogin} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('register-login-link'));
    });

    expect(onNavigateToLogin).toHaveBeenCalledTimes(1);
  });
});
