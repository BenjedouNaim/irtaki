import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as meApi from '@/shared/api/me.client';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { AdminStack } from '../AdminStack';

jest.mock('@/shared/api/auth.client');
jest.mock('@/shared/api/me.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const ADMIN: meApi.MeResponse = {
  id: 'admin-1',
  role: 'Admin',
  email: 'admin@example.com',
  full_name: 'خليل بن يعلى',
  gender: 'Male',
  timezone: 'Africa/Tunis',
};

let queryClient: QueryClient;

function render() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>
      <AdminStack />
    </QueryClientProvider>,
  );
}

describe('AdminStack (SCR-26 Admin Home, Figma 39:2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (meApi.getMe as jest.Mock).mockResolvedValue(ADMIN);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders the tab-root TopBar, the greeting and the role line', async () => {
    render();

    expect(screen.getByTestId('admin-stack')).toBeTruthy();
    expect(screen.getByTestId('admin-top-bar-title').props.children).toBe(
      'الإدارة',
    );
    expect(screen.getByTestId('admin-role-line').props.children).toBe(
      'مدير · قراءة كاملة، وإعدادات هيكلية فقط',
    );
    await waitFor(() =>
      expect(screen.getByTestId('admin-greeting').props.children).toBe(
        'مرحبًا، خليل',
      ),
    );
  });

  it('greets without a name when GET /me is unavailable', async () => {
    (meApi.getMe as jest.Mock).mockRejectedValue(new Error('offline'));
    render();

    await waitFor(() =>
      expect(screen.getByTestId('admin-greeting').props.children).toBe(
        'مرحبًا',
      ),
    );
  });

  it('renders the four dashboard tiles as an unwired shell', () => {
    render();

    expect(screen.getByTestId('admin-summary-tiles')).toBeTruthy();
    expect(
      screen.getByTestId('admin-summary-tiles-groups-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('admin-summary-tiles-staff-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('admin-summary-tiles-students-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
    expect(
      screen.getByTestId('admin-summary-tiles-recoveries-value').props.children,
    ).toBe(METRIC_TILE_NULL_VALUE);
  });

  it('renders exactly the three menu rows of the frame', () => {
    render();

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
    render();

    fireEvent.press(screen.getByTestId('admin-groups-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/groups');

    fireEvent.press(screen.getByTestId('admin-users-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/users');

    // UF §27: the audit log is reached from Admin Home ("Home → Audit Log").
    fireEvent.press(screen.getByTestId('admin-audit-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/admin/audit');
  });

  it('opens SCR-34 Profile from the TopBar trailing slot', () => {
    render();

    const profile = screen.getByTestId('profile-button');
    expect(profile.props.accessibilityLabel).toBe('الملف الشخصي');
    fireEvent.press(profile);
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });
});
