import React from 'react';
import {
  render as rtlRender,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AssistantTabs } from '../AssistantTabs';
import * as dashboardApi from '@/shared/api/dashboard.client';
import * as groupsApi from '@/shared/api/groups.client';
import * as meApi from '@/shared/api/me.client';
import * as authApi from '@/shared/api/auth.client';
import * as authStore from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/dashboard.client');
jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/me.client');
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
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const me: meApi.MeResponse = {
  id: 'user-1',
  role: 'Assistant',
  email: 'sara@example.com',
  full_name: 'سارة بن علي',
  gender: 'Female',
  timezone: 'Africa/Tunis',
};

const dashboard: dashboardApi.AssistantDashboardDto = {
  pending_request_count: 4,
  groups: [
    { id: 'g-1', name: 'حلقة الفجر', payment_followup_count: 4 },
    { id: 'g-2', name: 'حلقة النور', payment_followup_count: 2 },
  ],
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

describe('AssistantTabs (SCR-17 Assistant Home)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(meApi, 'getMe').mockResolvedValue(me);
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('renders the skeleton while the dashboard call is in flight', () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockReturnValue(new Promise(() => {}));

    render(<AssistantTabs />);

    expect(screen.getByTestId('assistant-home-loading')).toBeTruthy();
    expect(
      screen.getByTestId('assistant-home-top-bar-title'),
    ).toHaveTextContent('الرئيسية');
  });

  it('renders the two summary tiles and the groups from ONE call', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(dashboard);

    render(<AssistantTabs />);

    await waitFor(() => {
      expect(screen.getByTestId('assistant-summary-tiles')).toBeTruthy();
    });

    expect(
      screen.getByTestId('assistant-summary-tiles-pending-value').props
        .children,
    ).toBe('4');
    // 4 + 2 across the assigned groups.
    expect(
      screen.getByTestId('assistant-summary-tiles-follow-ups-value').props
        .children,
    ).toBe('6');

    expect(screen.getByTestId('assistant-home-greeting')).toHaveTextContent(
      'مرحبًا، سارة',
    );
    expect(screen.getByTestId('assistant-home-subtitle')).toHaveTextContent(
      'مساعدة · مجموعتان مُسندتان',
    );
    expect(
      screen.getByTestId('assistant-group-row-g-1-title'),
    ).toHaveTextContent('حلقة الفجر');
    expect(
      screen.getByTestId('assistant-group-row-g-1-badge'),
    ).toHaveTextContent('4 متابعات دفع');

    expect(dashboardApi.getMyDashboard).toHaveBeenCalledTimes(1);
    // F-DASH-03: the dashboard already names the assigned groups.
    expect(groupsApi.listGroups).not.toHaveBeenCalled();
  });

  it('shows no performance figure anywhere, at any depth (DEC-B09, UF §10)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(dashboard);

    render(<AssistantTabs />);
    await waitFor(() => {
      expect(screen.getByTestId('assistant-summary-tiles')).toBeTruthy();
    });

    for (const forbidden of [
      /نسبة الالتزام/,
      /متوسط الالتزام/,
      /نسبة الإرسال/,
      /معرّضون للخطر/,
    ]) {
      expect(screen.queryByText(forbidden)).toBeNull();
    }
  });

  it('routes the tiles to the Join Requests queue and the Payments ledger (UF §10)', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(dashboard);

    render(<AssistantTabs />);
    await waitFor(() => {
      expect(screen.getByTestId('assistant-summary-tiles')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('assistant-summary-tiles-pending'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/join-requests');

    fireEvent.press(screen.getByTestId('assistant-summary-tiles-follow-ups'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/payments');
  });

  it('renders the "no groups assigned" empty state, tiles included (UF §23)', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ pending_request_count: 0, groups: [] });

    render(<AssistantTabs />);

    expect(
      await screen.findByText(
        'لم تُسند إليك أي مجموعة بعد — الإسناد من صلاحيات المدير',
      ),
    ).toBeTruthy();
    expect(screen.getByTestId('assistant-home-empty')).toBeTruthy();
    expect(screen.getByTestId('assistant-home-subtitle')).toHaveTextContent(
      'مساعدة · لا مجموعات مُسندة بعد',
    );
    // A genuine count of zero is zero, not the null state.
    expect(
      screen.getByTestId('assistant-summary-tiles-follow-ups-value').props
        .children,
    ).toBe('0');
  });

  it('shows the generic retry banner on a network failure and retries', async () => {
    const spy = jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(dashboard);

    render(<AssistantTabs />);

    expect(
      await screen.findByText(
        'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('assistant-home-error-retry-button'));

    expect(await screen.findByText('حلقة الفجر')).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never shows a 5xx server message, and falls back to a plain greeting when /me fails', async () => {
    jest.spyOn(meApi, 'getMe').mockRejectedValue(new Error('boom'));
    jest.spyOn(dashboardApi, 'getMyDashboard').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'stack trace leaked',
      }),
    );

    render(<AssistantTabs />);

    expect(
      await screen.findByText('حدث خطأ أثناء تحميل الصفحة الرئيسية'),
    ).toBeTruthy();
    expect(screen.queryByText('stack trace leaked')).toBeNull();
    expect(screen.getByTestId('assistant-home-greeting')).toHaveTextContent(
      'مرحبًا',
    );
  });

  it('exposes the Assistant tab bar: Home active, Join Requests and Payments push', async () => {
    jest.spyOn(dashboardApi, 'getMyDashboard').mockResolvedValue(dashboard);

    render(<AssistantTabs />);
    await screen.findByText('حلقة الفجر');

    expect(
      screen.getByTestId('assistant-tab-bar-home').props.accessibilityState
        .selected,
    ).toBe(true);

    fireEvent.press(screen.getByTestId('assistant-tab-bar-join-requests'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/join-requests');

    fireEvent.press(screen.getByTestId('assistant-tab-bar-payments'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/payments');
  });

  it('navigates to the profile from the trailing top-bar control', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ pending_request_count: 0, groups: [] });

    render(<AssistantTabs />);
    await screen.findByTestId('assistant-home-empty');

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });

  it('logs out from the ghost action', async () => {
    jest
      .spyOn(dashboardApi, 'getMyDashboard')
      .mockResolvedValue({ pending_request_count: 0, groups: [] });
    (authStore.getStoredRefreshToken as jest.Mock).mockResolvedValue(
      'sample-refresh-token',
    );
    (authApi.logoutUser as jest.Mock).mockResolvedValue(undefined);

    render(<AssistantTabs />);
    await screen.findByTestId('assistant-home-empty');

    fireEvent.press(screen.getByTestId('logout-button'));

    await waitFor(() => {
      expect(authApi.logoutUser).toHaveBeenCalledWith('sample-refresh-token');
      expect(authStore.deleteStoredRefreshToken).toHaveBeenCalled();
    });
  });
});
