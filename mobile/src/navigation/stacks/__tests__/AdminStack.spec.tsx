import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { AdminStack } from '../AdminStack';

jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('AdminStack (SCR-26 Admin Home, Figma 39:2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the tab-root TopBar, the role line and the menu rows', () => {
    render(<AdminStack />);

    expect(screen.getByTestId('admin-stack')).toBeTruthy();
    expect(screen.getByTestId('admin-top-bar-title').props.children).toBe(
      'الإدارة',
    );
    expect(screen.getByTestId('admin-greeting').props.children).toBe(
      'مدير · قراءة كاملة، وإعدادات هيكلية فقط',
    );
    expect(screen.getByText('المجموعات')).toBeTruthy();
    expect(
      screen.getByText('إنشاء · أرشفة · إسناد الطاقم · القوائم'),
    ).toBeTruthy();
    // Staff & Users / Audit Log screens do not exist — no row leads there.
    expect(screen.queryByText('الطاقم والمستخدمون')).toBeNull();
    expect(screen.queryByText('سجل التدقيق')).toBeNull();
  });

  it('routes to the groups list and to the profile', () => {
    render(<AdminStack />);

    fireEvent.press(screen.getByTestId('admin-groups-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups');

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
