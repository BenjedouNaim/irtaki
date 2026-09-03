import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
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

  it('renders the tab-root TopBar and the role line', () => {
    render(<AdminStack />);

    expect(screen.getByTestId('admin-stack')).toBeTruthy();
    expect(screen.getByTestId('admin-top-bar-title').props.children).toBe(
      'الإدارة',
    );
    expect(screen.getByTestId('admin-role-line').props.children).toBe(
      'مدير · قراءة كاملة، وإعدادات هيكلية فقط',
    );
  });

  it('renders the four dashboard tiles as an unwired shell', () => {
    render(<AdminStack />);

    expect(screen.getByTestId('admin-summary-tiles')).toBeTruthy();
    for (const key of ['groups', 'staff', 'students', 'recoveries']) {
      expect(
        screen.getByTestId(`admin-summary-tiles-${key}-value`).props.children,
      ).toBe(METRIC_TILE_NULL_VALUE);
    }
  });

  it('renders exactly the three menu rows of the frame', () => {
    render(<AdminStack />);

    const rows: [string, string, string][] = [
      ['groups', 'المجموعات', 'إنشاء · أرشفة · إسناد الطاقم · القوائم'],
      ['users', 'الطاقم والمستخدمون', 'ترقية مستخدم إلى معلّم أو مساعد'],
      ['audit', 'سجل التدقيق', 'تسجيل الدخول · إنشاء مجموعة · تبديل التسجيل'],
    ];
    for (const [key, title, subtitle] of rows) {
      expect(
        screen.getByTestId(`admin-${key}-button-title`).props.children,
      ).toBe(title);
      expect(
        screen.getByTestId(`admin-${key}-button-subtitle`).props.children,
      ).toBe(subtitle);
    }
    expect(
      screen.getAllByTestId(/^admin-(groups|users|audit)-button$/),
    ).toHaveLength(3);
  });

  it('routes to the groups list, the user directory and the audit log', () => {
    render(<AdminStack />);

    fireEvent.press(screen.getByTestId('admin-groups-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups');

    fireEvent.press(screen.getByTestId('admin-users-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/users');

    // UF §27: the audit log is reached from Admin Home ("Home → Audit Log").
    fireEvent.press(screen.getByTestId('admin-audit-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/audit');
  });

  it('gives the group and staff tiles UF §10 tap targets', () => {
    render(<AdminStack />);

    fireEvent.press(screen.getByTestId('admin-summary-tiles-groups'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups');

    fireEvent.press(screen.getByTestId('admin-summary-tiles-staff'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/users');

    // UF §10: student count is non-tappable, pending recoveries informational.
    fireEvent.press(screen.getByTestId('admin-summary-tiles-students'));
    fireEvent.press(screen.getByTestId('admin-summary-tiles-recoveries'));
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it('opens SCR-34 Profile from the TopBar trailing slot', () => {
    render(<AdminStack />);

    const profile = screen.getByTestId('profile-button');
    expect(profile.props.accessibilityLabel).toBe('الملف الشخصي');
    fireEvent.press(profile);
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
