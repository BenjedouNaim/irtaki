import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { AssistantTabs } from '../AssistantTabs';
import * as groupsApi from '@/shared/api/groups.client';
import * as meApi from '@/shared/api/me.client';
import * as authApi from '@/shared/api/auth.client';
import * as authStore from '@/shared/auth/authStore';
import { ApiError } from '@/shared/api/types';

jest.mock('@/shared/api/groups.client');
jest.mock('@/shared/api/me.client');
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

const groups: groupsApi.GroupListItemFull[] = [
  {
    id: 'g-1',
    name: 'حلقة الفجر',
    gender: 'Female',
    recitation_day: 6,
    enrollment_status: 'Open',
    lifecycle_state: 'Active',
    teacher: { id: 't-1', full_name: null },
    assistant: { id: 'user-1', full_name: 'سارة بن علي' },
  },
  {
    id: 'g-2',
    name: 'حلقة النور',
    gender: 'Female',
    recitation_day: 2,
    enrollment_status: 'Closed',
    lifecycle_state: 'Active',
    teacher: { id: 't-2', full_name: null },
    assistant: { id: 'user-1', full_name: 'سارة بن علي' },
  },
];

describe('AssistantTabs (SCR-17 Assistant Home)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (meApi.getMe as jest.Mock).mockResolvedValue(me);
  });

  it('renders the skeleton while loading', () => {
    (groupsApi.listGroups as jest.Mock).mockReturnValue(new Promise(() => {}));
    (meApi.getMe as jest.Mock).mockReturnValue(new Promise(() => {}));

    render(<AssistantTabs />);

    expect(screen.getByTestId('assistant-home-loading')).toBeTruthy();
    expect(
      screen.getByTestId('assistant-home-top-bar-title'),
    ).toHaveTextContent('الرئيسية');
    expect(screen.getByTestId('assistant-home-greeting')).toHaveTextContent(
      'مرحبًا',
    );
  });

  it('greets by first name and lists the assigned groups with their recitation day', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: groups });

    render(<AssistantTabs />);

    await waitFor(() => {
      expect(screen.queryByTestId('assistant-home-loading')).toBeNull();
    });

    expect(screen.getByTestId('assistant-home-greeting')).toHaveTextContent(
      'مرحبًا، سارة',
    );
    expect(screen.getByTestId('assistant-home-subtitle')).toHaveTextContent(
      'مساعدة · مجموعتان مُسندتان',
    );
    expect(screen.getByText('مجموعاتك')).toBeTruthy();
    expect(
      screen.getByTestId('assistant-group-row-g-1-title'),
    ).toHaveTextContent('حلقة الفجر');
    expect(
      screen.getByTestId('assistant-group-row-g-1-subtitle'),
    ).toHaveTextContent('يوم التسميع: السبت');
    expect(
      screen.getByTestId('assistant-group-row-g-2-title'),
    ).toHaveTextContent('حلقة النور');
    // No commitment / performance figure ever (DEC-B09, UF §10)
    expect(screen.queryByText(/نسبة الالتزام/)).toBeNull();
  });

  it('renders the "no groups assigned" empty state (UF §23)', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: [] });

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
  });

  it('shows the generic retry banner on a network failure and retries', async () => {
    (groupsApi.listGroups as jest.Mock)
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ data: groups });

    render(<AssistantTabs />);

    expect(
      await screen.findByText(
        'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.',
      ),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('assistant-home-error-retry-button'));

    expect(await screen.findByText('حلقة الفجر')).toBeTruthy();
    expect(groupsApi.listGroups).toHaveBeenCalledTimes(2);
  });

  it('never shows a 5xx server message, and falls back to a plain greeting when /me fails', async () => {
    (meApi.getMe as jest.Mock).mockRejectedValue(new Error('boom'));
    (groupsApi.listGroups as jest.Mock).mockRejectedValueOnce(
      new ApiError({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'stack trace leaked',
      }),
    );

    render(<AssistantTabs />);

    expect(
      await screen.findByText('حدث خطأ أثناء تحميل المجموعات'),
    ).toBeTruthy();
    expect(screen.queryByText('stack trace leaked')).toBeNull();
    expect(screen.getByTestId('assistant-home-greeting')).toHaveTextContent(
      'مرحبًا',
    );
  });

  it('exposes the Assistant tab bar: Home active, Join Requests and Payments push', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: groups });

    render(<AssistantTabs />);
    await screen.findByText('حلقة الفجر');

    expect(
      screen.getByTestId('assistant-tab-bar-home').props.accessibilityState
        .selected,
    ).toBe(true);
    expect(
      screen.getByTestId('assistant-tab-bar-payments').props.accessibilityState
        .disabled,
    ).toBeUndefined();

    fireEvent.press(screen.getByTestId('assistant-tab-bar-join-requests'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/join-requests');

    // SCR-20 is live since F-PAY-02 — the tab is no longer a placeholder.
    fireEvent.press(screen.getByTestId('assistant-tab-bar-payments'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/assistant/payments');
  });

  it('navigates to the profile from the trailing top-bar control', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: [] });

    render(<AssistantTabs />);
    await screen.findByTestId('assistant-home-empty');

    fireEvent.press(screen.getByTestId('profile-button'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/profile');
  });

  it('logs out from the ghost action', async () => {
    (groupsApi.listGroups as jest.Mock).mockResolvedValue({ data: [] });
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
