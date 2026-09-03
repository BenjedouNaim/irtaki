import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { UserStack } from '../UserStack';
import * as joinRequestsApi from '@/shared/api/joinRequests.client';
import * as authApi from '@/shared/api/auth.client';
import * as authStore from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/joinRequests.client');
jest.mock('@/shared/api/auth.client');
jest.mock('@/shared/auth/authStore', () => {
  const original = jest.requireActual('@/shared/auth/authStore');
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

describe('UserStack (SCR-05 / F-ENR-02)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStore.useAuthStore.getState().clearSession();
  });

  it('renders skeleton loader while fetching join request status', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockReturnValue(
      new Promise(() => {}), // Keep pending
    );

    render(<UserStack />);

    expect(screen.getByTestId('user-stack-loading')).toBeTruthy();
  });

  it('renders "Browse Groups" CTA when API returns 404 (No prior request)', async () => {
    const error404 = new ApiError({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: 'لا يوجد طلب انضمام سابق',
    });
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockRejectedValue(error404);

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    expect(screen.getByText('أهلًا بك')).toBeTruthy();
    expect(screen.getByTestId('user-stack-top-bar-title')).toHaveTextContent(
      'ارتقِ',
    );
    expect(screen.getByTestId('no-join-request-card')).toBeTruthy();
    expect(screen.getByText('لم تنضم إلى مجموعة بعد')).toBeTruthy();
    expect(screen.getByTestId('browse-groups-button')).toBeTruthy();
    expect(screen.getByText('تصفّح المجموعات')).toBeTruthy();
    expect(screen.getByTestId('profile-button')).toBeTruthy();
    expect(screen.getByTestId('logout-button')).toBeTruthy();
    expect(screen.queryByTestId('join-request-status-card')).toBeNull();

    // Tap Browse Groups
    fireEvent.press(screen.getByTestId('browse-groups-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/user/join-stepper');
  });

  it('renders Pending JoinRequestStatusCard and hides "Browse Groups" CTA on 200 Pending', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockResolvedValue({
      data: {
        status: 'Pending',
      },
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('قيد المراجعة')).toBeTruthy();
    expect(screen.getByText('طلبك قيد المراجعة')).toBeTruthy();

    // "Browse Groups" CTA must NOT be rendered when request is Pending
    expect(screen.queryByTestId('browse-groups-button')).toBeNull();
    expect(screen.queryByTestId('no-join-request-card')).toBeNull();
  });

  it('renders Rejected JoinRequestStatusCard with "Apply again" button on 200 Rejected', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockResolvedValue({
      data: {
        status: 'Rejected',
      },
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('لم يُقبل')).toBeTruthy();
    expect(screen.getByText('لم يُقبل طلبك هذه المرة')).toBeTruthy();

    // "Browse Groups" CTA must NOT be rendered outside the card
    expect(screen.queryByTestId('browse-groups-button')).toBeNull();

    // "Apply again" CTA inside status card
    const applyAgainBtn = screen.getByTestId('apply-again-button');
    expect(applyAgainBtn).toBeTruthy();
    expect(screen.getByText('التقديم مجددًا')).toBeTruthy();

    fireEvent.press(applyAgainBtn);
    expect(mockPush).toHaveBeenCalledWith('/(app)/user/join-stepper');
  });

  it('renders retry error banner on network error and retries on press', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        data: {
          status: 'Pending',
        },
      });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    expect(screen.getByTestId('user-stack-error-banner')).toBeTruthy();
    expect(
      screen.getByText(
        'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مجدداً.',
      ),
    ).toBeTruthy();

    const retryBtn = screen.getByTestId('user-stack-error-banner-retry-button');
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-error-banner')).toBeNull();
    });

    expect(screen.getByTestId('join-request-status-card')).toBeTruthy();
    expect(screen.getByText('قيد المراجعة')).toBeTruthy();
  });

  it('navigates to profile when profile button is pressed', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockResolvedValue({
      data: {
        status: 'Pending',
      },
    });

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    const profileBtn = screen.getByTestId('profile-button');
    fireEvent.press(profileBtn);
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });

  it('handles logout process correctly', async () => {
    (joinRequestsApi.getMyJoinRequest as jest.Mock).mockResolvedValue({
      data: {
        status: 'Pending',
      },
    });
    (authStore.getStoredRefreshToken as jest.Mock).mockResolvedValue(
      'sample-refresh-token',
    );
    (authApi.logoutUser as jest.Mock).mockResolvedValue(undefined);

    render(<UserStack />);

    await waitFor(() => {
      expect(screen.queryByTestId('user-stack-loading')).toBeNull();
    });

    const logoutBtn = screen.getByTestId('logout-button');
    fireEvent.press(logoutBtn);

    await waitFor(() => {
      expect(authApi.logoutUser).toHaveBeenCalledWith('sample-refresh-token');
      expect(authStore.deleteStoredRefreshToken).toHaveBeenCalled();
    });
  });
});
