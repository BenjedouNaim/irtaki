import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserStack } from '../UserStack';
import * as dashboardApi from '@/shared/api/dashboard.client';
import * as joinRequestsApi from '@/shared/api/joinRequests.client';
import * as authApi from '@/shared/api/auth.client';
import * as authStore from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/dashboard.client');
jest.mock('@/shared/api/joinRequests.client');
jest.mock('@/shared/api/auth.client');
jest.mock('@/shared/auth/authStore', () => {
  const original = jest.requireActual<typeof authStore>(
    '@/shared/auth/authStore',
  );
  return {
    ...original,
    getStoredRefreshToken: jest.fn(),
    deleteStoredRefreshToken: jest.fn(),
  };
});

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('UserStack (SCR-05 / F-ENR-02 wired to F-DASH-01)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStore.useAuthStore.getState().clearSession();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders the skeleton while the dashboard call is in flight', () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockReturnValue(new Promise(() => {}));

    render(<UserStack />);

    expect(screen.getByTestId('user-stack-loading')).toBeTruthy();
  });

  it('reads the status from GET /me/dashboard, never GET /join-requests/mine', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ has_pending_request: false });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('no-join-request-card')).toBeTruthy();
    });

    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
    // F-DASH-03: no duplicate network call now the dashboard carries this.
    expect(joinRequestsApi.getMyJoinRequest).not.toHaveBeenCalled();
  });

  it('renders the "Browse Groups" entry point when the caller never applied', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ has_pending_request: false });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('no-join-request-card')).toBeTruthy();
    });

    expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    expect(screen.getByText('أهلًا بك')).toBeTruthy();
    expect(screen.getByTestId('user-stack-top-bar-title')).toHaveTextContent(
      'ارتقِ',
    );
    expect(screen.getByTestId('browse-groups-button')).toBeTruthy();
    expect(screen.queryByTestId('join-request-status-card')).toBeNull();

    fireEvent.press(screen.getByTestId('browse-groups-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/user/join-stepper');
  });

  it('renders the Pending status card and hides the browse CTA', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      has_pending_request: true,
      pending_request_status: 'Pending',
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    });

    expect(screen.getByText('قيد المراجعة')).toBeTruthy();
    expect(screen.getByText('طلبك قيد المراجعة')).toBeTruthy();
    expect(screen.queryByTestId('browse-groups-button')).toBeNull();
    expect(screen.queryByTestId('no-join-request-card')).toBeNull();
  });

  it('renders the Rejected status card with "Apply again" (UF §10)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      has_pending_request: false,
      pending_request_status: 'Rejected',
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    });

    expect(screen.getByText('لم يُقبل')).toBeTruthy();
    expect(screen.getByText('لم يُقبل طلبك هذه المرة')).toBeTruthy();
    expect(screen.queryByTestId('browse-groups-button')).toBeNull();

    const applyAgainBtn = screen.getByTestId('apply-again-button');
    fireEvent.press(applyAgainBtn);
    expect(mockPush).toHaveBeenCalledWith('/(app)/user/join-stepper');
  });

  it('shows the generic network copy and recovers on retry (UF §24)', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        has_pending_request: true,
        pending_request_status: 'Pending',
      });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('user-stack-error-banner')).toBeTruthy();
    });
    expect(
      screen.getByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('user-stack-error-banner-retry-button'));

    await waitFor(() => {
      expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    });
  });

  it('never shows the server message on a 5xx (UF §24)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'relation "join_requests" does not exist',
      }),
    );

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('user-stack-error-banner')).toBeTruthy();
    });
    expect(
      screen.getByText('حدث خطأ أثناء تحميل الصفحة الرئيسية'),
    ).toBeTruthy();
    expect(
      screen.queryByText('relation "join_requests" does not exist'),
    ).toBeNull();
  });

  it('navigates to the profile', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      has_pending_request: true,
      pending_request_status: 'Pending',
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });

  it('handles logout', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue({
      has_pending_request: true,
      pending_request_status: 'Pending',
    });
    (authStore.getStoredRefreshToken as jest.Mock).mockResolvedValue(
      'sample-refresh-token',
    );
    (authApi.logoutUser as jest.Mock).mockResolvedValue(undefined);

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(authApi.logoutUser).toHaveBeenCalledWith('sample-refresh-token');
      expect(authStore.deleteStoredRefreshToken).toHaveBeenCalled();
    });
  });
});
