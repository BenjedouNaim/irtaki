import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ProfileScreen } from '../ProfileScreen';
import * as meApi from '@/shared/api/me.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/me.client');

describe('ProfileScreen (SCR-34)', () => {
  const sampleProfile: meApi.MeResponse = {
    id: '01912345-6789-7000-8000-000000000001',
    role: 'Student',
    email: 'student@example.com',
    full_name: 'أحمد بن علي',
    gender: 'Male',
    timezone: 'Africa/Tunis',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeleton initially while fetching profile', async () => {
    // Return pending promise to keep component in loading state
    jest.spyOn(meApi, 'getMe').mockImplementation(() => new Promise(() => {}));

    const { getByTestId } = await render(<ProfileScreen />);
    expect(getByTestId('profile-loading-skeleton')).toBeTruthy();
  });

  it('renders profile data with read-only displays and editable timezone on successful load', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(sampleProfile);

    const { findByText, getByTestId, getByDisplayValue } = await render(
      <ProfileScreen />,
    );

    expect(await findByText('الملف الشخصي')).toBeTruthy();
    expect(getByDisplayValue('student@example.com')).toBeTruthy();
    expect(getByDisplayValue('أحمد بن علي')).toBeTruthy();
    expect(getByDisplayValue('ذكر')).toBeTruthy();
    expect(getByDisplayValue('طالب')).toBeTruthy();
    expect(getByDisplayValue('Africa/Tunis')).toBeTruthy();
    expect(getByTestId('profile-submit-button')).toBeTruthy();
  });

  it('renders fallback placeholders when full_name and gender are null', async () => {
    const preEnrollProfile: meApi.MeResponse = {
      id: '01912345-6789-7000-8000-000000000002',
      role: 'User',
      email: 'newuser@example.com',
      full_name: null,
      gender: null,
      timezone: 'Africa/Tunis',
    };
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(preEnrollProfile);

    const { findByText, getAllByDisplayValue, getByDisplayValue } =
      await render(<ProfileScreen />);

    expect(await findByText('الملف الشخصي')).toBeTruthy();
    expect(getByDisplayValue('newuser@example.com')).toBeTruthy();
    expect(getByDisplayValue('مستخدم جديد')).toBeTruthy();
    // Both full_name and gender show 'غير محدد بعد'
    const placeholders = getAllByDisplayValue('غير محدد بعد');
    expect(placeholders.length).toBe(2);
  });

  it('shows error banner with retry button on fetch failure and retries successfully', async () => {
    jest
      .spyOn(meApi, 'getMe')
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(sampleProfile);

    const { findByTestId, getByTestId, findByText } = await render(
      <ProfileScreen />,
    );

    expect(await findByTestId('profile-load-error-banner')).toBeTruthy();
    expect(getByTestId('profile-retry-button')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('profile-retry-button'));
    });

    expect(await findByText('الملف الشخصي')).toBeTruthy();
    expect(meApi.getMe).toHaveBeenCalledTimes(2);
  });

  it('validates timezone presence on submit (client validation)', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(sampleProfile);

    const { findByTestId, getByTestId, findByText } = await render(
      <ProfileScreen />,
    );

    await findByTestId('profile-screen');

    await act(async () => {
      fireEvent.changeText(getByTestId('profile-timezone-input'), '');
    });

    await act(async () => {
      fireEvent.press(getByTestId('profile-submit-button'));
    });

    expect(await findByText('المنطقة الزمنية مطلوبة')).toBeTruthy();
    expect(meApi.updateProfile).not.toHaveBeenCalled();
  });

  it('successfully submits timezone update and shows success banner', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(sampleProfile);
    const updatedProfile: meApi.MeResponse = {
      ...sampleProfile,
      timezone: 'Europe/Paris',
    };
    jest.spyOn(meApi, 'updateProfile').mockResolvedValueOnce(updatedProfile);

    const { findByTestId, getByTestId, findByText } = await render(
      <ProfileScreen />,
    );

    await findByTestId('profile-screen');

    await act(async () => {
      fireEvent.changeText(
        getByTestId('profile-timezone-input'),
        'Europe/Paris',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('profile-submit-button'));
    });

    expect(meApi.updateProfile).toHaveBeenCalledWith({
      timezone: 'Europe/Paris',
    });

    expect(await findByText('تم تحديث الملف الشخصي بنجاح')).toBeTruthy();
    expect(getByTestId('profile-success-banner')).toBeTruthy();
  });

  it('handles 422 INVALID_TIMEZONE error from backend with field-level error', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(sampleProfile);
    jest.spyOn(meApi, 'updateProfile').mockRejectedValueOnce(
      new ApiError({
        statusCode: 422,
        error: 'INVALID_TIMEZONE',
        message: 'المنطقة الزمنية غير صالحة',
        details: [
          { field: 'timezone', message: 'المنطقة الزمنية المحددة غير صالحة' },
        ],
      }),
    );

    const { findByTestId, getByTestId, findByText } = await render(
      <ProfileScreen />,
    );

    await findByTestId('profile-screen');

    await act(async () => {
      fireEvent.changeText(
        getByTestId('profile-timezone-input'),
        'Invalid/Timezone',
      );
    });

    await act(async () => {
      fireEvent.press(getByTestId('profile-submit-button'));
    });

    expect(await findByText('المنطقة الزمنية المحددة غير صالحة')).toBeTruthy();
  });

  it('handles network error on submit and shows general error banner preserving form input', async () => {
    jest.spyOn(meApi, 'getMe').mockResolvedValueOnce(sampleProfile);
    jest
      .spyOn(meApi, 'updateProfile')
      .mockRejectedValueOnce(new Error('Network error'));

    const { findByTestId, getByTestId, findByText, getByDisplayValue } =
      await render(<ProfileScreen />);

    await findByTestId('profile-screen');

    await act(async () => {
      fireEvent.changeText(getByTestId('profile-timezone-input'), 'UTC');
    });

    await act(async () => {
      fireEvent.press(getByTestId('profile-submit-button'));
    });

    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    expect(getByTestId('profile-general-error')).toBeTruthy();
    // Form value preserved
    expect(getByDisplayValue('UTC')).toBeTruthy();
  });
});
