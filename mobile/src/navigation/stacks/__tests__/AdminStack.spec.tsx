import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { METRIC_TILE_NULL_VALUE } from '@/shared/components/MetricTile';
import { AdminStack } from '../AdminStack';
import * as dashboardApi from '@/shared/api/dashboard.client';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/dashboard.client');
jest.mock('@/shared/api/auth.client');

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const counts: dashboardApi.AdminDashboardDto = {
  group_count: 4,
  staff_count: 5,
  student_count: 32,
  pending_recovery_count: 6,
};

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('AdminStack (SCR-26 Admin Home, Figma 39:2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(counts);
  });

  afterEach(() => {
    queryClient?.clear();
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

  it('renders the F-ADM-04 tile shell fed by API-009, not rebuilt', async () => {
    render(<AdminStack />);

    // The shell renders its documented Null state until the call resolves.
    expect(screen.getByTestId('admin-summary-loading')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId('admin-summary-tiles')).toBeTruthy();
    });

    const expected: [string, string][] = [
      ['groups', '4'],
      ['staff', '5'],
      ['students', '32'],
      ['recoveries', '6'],
    ];
    for (const [key, value] of expected) {
      expect(
        screen.getByTestId(`admin-summary-tiles-${key}-value`).props.children,
      ).toBe(value);
    }
    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
  });

  it('keeps the tiles in their Null state and the menu usable when the call fails (UF §24)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'relation "users" does not exist',
      }),
    );

    render(<AdminStack />);

    await waitFor(() => {
      expect(screen.getByTestId('admin-summary-error')).toBeTruthy();
    });
    expect(
      screen.getByText('حدث خطأ أثناء تحميل الصفحة الرئيسية'),
    ).toBeTruthy();
    expect(screen.queryByText(/relation/)).toBeNull();
    for (const key of ['groups', 'staff', 'students', 'recoveries']) {
      expect(
        screen.getByTestId(`admin-summary-tiles-${key}-value`).props.children,
      ).toBe(METRIC_TILE_NULL_VALUE);
    }
    // The menu is Admin's real workflow and never depends on the tiles.
    expect(screen.getByTestId('admin-groups-button')).toBeTruthy();
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

  it('gives the group and staff tiles UF §10 tap targets', async () => {
    render(<AdminStack />);
    await waitFor(() => {
      expect(screen.getByTestId('admin-summary-tiles')).toBeTruthy();
    });

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
