import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { LoginScreen } from '../LoginScreen';
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

describe('LoginScreen (SCR-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.getState().clearSession();
  });

  it('renders email and password inputs, submit button, and app title', async () => {
    const { getByText, getAllByText, getByTestId } = await render(
      <LoginScreen />,
    );

    expect(getByText('ارتقِ')).toBeTruthy();
    expect(getByText('سجّل الدخول لمتابعة رحلة الحفظ')).toBeTruthy();
    expect(getAllByText('تسجيل الدخول').length).toBeGreaterThanOrEqual(1);
    expect(getByTestId('login-email-input')).toBeTruthy();
    expect(getByTestId('login-password-input')).toBeTruthy();
    expect(getByTestId('login-submit-button')).toBeTruthy();
  });

  it('shows error when submitting empty fields', async () => {
    const { getByTestId, findByText } = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني مطلوب')).toBeTruthy();
    expect(await findByText('كلمة المرور مطلوبة')).toBeTruthy();
  });

  it('shows error when email format is invalid', async () => {
    const { getByTestId, findByText } = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.changeText(getByTestId('login-email-input'), 'invalid-email');
      fireEvent.changeText(getByTestId('login-password-input'), 'anyPassword');
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني غير صالح')).toBeTruthy();
  });

  it('handles 401 INVALID_CREDENTIALS by showing banner above form and clearing password', async () => {
    jest.spyOn(authApi, 'loginUser').mockRejectedValueOnce(
      new ApiError({
        statusCode: 401,
        error: 'INVALID_CREDENTIALS',
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      }),
    );

    const { getByTestId, findByText } = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('login-email-input'),
        'user@example.com',
      );
      fireEvent.changeText(
        getByTestId('login-password-input'),
        'WrongPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    expect(
      await findByText('البريد الإلكتروني أو كلمة المرور غير صحيحة'),
    ).toBeTruthy();
    // Figma 20:55 — Banner (error tone) with the circle-x glyph, never colour alone
    expect(getByTestId('login-general-error')).toBeTruthy();
    expect(getByTestId('login-general-error-icon')).toBeTruthy();
    expect(getByTestId('login-password-input').props.value).toBe('');
  });

  it('handles 422 validation errors from backend', async () => {
    jest.spyOn(authApi, 'loginUser').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'فشل التحقق من صحة البيانات',
        details: [
          { field: 'email', message: 'البريد الإلكتروني غير صالح' },
          { field: 'password', message: 'كلمة المرور مطلوبة' },
        ],
      }),
    );

    const { getByTestId, findByText } = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('login-email-input'),
        'user@example.com',
      );
      fireEvent.changeText(getByTestId('login-password-input'), 'Password123!');
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    expect(await findByText('البريد الإلكتروني غير صالح')).toBeTruthy();
    expect(await findByText('كلمة المرور مطلوبة')).toBeTruthy();
  });

  it('successfully authenticates, stores session, and sets auth state on 200 response', async () => {
    jest.spyOn(authApi, 'loginUser').mockResolvedValueOnce({
      id: 'uuid-5678',
      role: 'Student',
      full_name: 'سارة أحمد',
      gender: 'Female',
      timezone: 'Africa/Tunis',
      access_token: 'mock-jwt-access-token',
      refresh_token: 'mock-jwt-refresh-token',
      dashboard_route: 'student',
    });

    const { getByTestId } = await render(<LoginScreen />);

    await act(async () => {
      fireEvent.changeText(
        getByTestId('login-email-input'),
        'student@example.com',
      );
      fireEvent.changeText(
        getByTestId('login-password-input'),
        'ValidPassword123!',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('login-submit-button'));
    });

    await waitFor(() => {
      expect(authApi.loginUser).toHaveBeenCalledWith({
        email: 'student@example.com',
        password: 'ValidPassword123!',
      });
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.accessToken).toBe('mock-jwt-access-token');
      expect(state.role).toBe('Student');
    });
  });

  it('calls onNavigateToRegister when register footer link is pressed', async () => {
    const onNavigateToRegister = jest.fn();
    const { getByTestId } = await render(
      <LoginScreen onNavigateToRegister={onNavigateToRegister} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('login-register-link'));
    });

    expect(onNavigateToRegister).toHaveBeenCalledTimes(1);
  });

  it('calls onNavigateToForgotPassword when forgot password link is pressed', async () => {
    const onNavigateToForgotPassword = jest.fn();
    const { getByTestId } = await render(
      <LoginScreen onNavigateToForgotPassword={onNavigateToForgotPassword} />,
    );

    await act(async () => {
      fireEvent.press(getByTestId('login-forgot-password-link'));
    });

    expect(onNavigateToForgotPassword).toHaveBeenCalledTimes(1);
  });

  it('displays success banner when successMessage prop is provided', async () => {
    const { getByTestId, findByText } = await render(
      <LoginScreen successMessage="تم تغيير كلمة المرور بنجاح" />,
    );

    expect(await findByText('تم تغيير كلمة المرور بنجاح')).toBeTruthy();
    expect(getByTestId('login-success-banner')).toBeTruthy();
  });

  it('masks the password and toggles visibility with the trailing eye control (Figma FormField TrailingIcon)', async () => {
    const { getByTestId, getByLabelText } = await render(<LoginScreen />);

    const input = getByTestId('login-password-input');
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.textAlign).toBe('left');

    await act(async () => {
      fireEvent.press(getByLabelText('إظهار كلمة المرور'));
    });

    expect(getByTestId('login-password-input').props.secureTextEntry).toBe(
      false,
    );
    expect(getByLabelText('إخفاء كلمة المرور')).toBeTruthy();
  });

  it('marks the email field focused (brand border) while editing', async () => {
    const { getByTestId } = await render(<LoginScreen />);

    const input = getByTestId('login-email-input');
    expect(input.props.className).toContain('border-line ');

    await act(async () => {
      fireEvent(input, 'focus');
    });
    expect(getByTestId('login-email-input').props.className).toContain(
      'border-line-brand',
    );

    await act(async () => {
      fireEvent(input, 'blur');
    });
    expect(getByTestId('login-email-input').props.className).not.toContain(
      'border-line-brand',
    );
  });
});
