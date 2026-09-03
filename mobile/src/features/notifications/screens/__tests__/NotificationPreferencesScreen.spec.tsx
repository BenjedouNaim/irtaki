import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as preferencesApi from '@/shared/api/notificationPreferences.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { NotificationPreferencesScreen } from '../NotificationPreferencesScreen';

jest.mock('@/shared/api/notificationPreferences.client');

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  router: { back: jest.fn() },
}));

/** The DEC-D03 catalogue as API-050 returns it (SAS §22.2, code order). */
const catalogue: preferencesApi.NotificationPreferenceDto[] = [
  {
    category: 'N-01',
    description: 'Daily report not yet submitted',
    is_mutable: true,
    muted: false,
  },
  {
    category: 'N-02',
    description: 'Weekly report available',
    is_mutable: true,
    muted: true,
  },
  {
    category: 'N-03',
    description: 'Join request accepted',
    is_mutable: false,
    muted: false,
  },
  {
    category: 'N-04',
    description: 'Join request rejected',
    is_mutable: false,
    muted: false,
  },
  {
    category: 'N-05',
    description: 'New join request received',
    is_mutable: true,
    muted: false,
  },
  {
    category: 'N-06',
    description: 'Payment due soon',
    is_mutable: true,
    muted: false,
  },
  {
    category: 'N-07',
    description: 'Student at risk',
    is_mutable: true,
    muted: false,
  },
  {
    category: 'N-08',
    description: 'Removed from group',
    is_mutable: false,
    muted: false,
  },
];

function renderScreen() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <NotificationPreferencesScreen />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe('NotificationPreferencesScreen (SCR-35, Figma 43:126)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a layout-matched skeleton while loading (UF §22)', () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockImplementation(() => new Promise(() => {}));

    const { getByTestId, queryClient } = renderScreen();

    expect(getByTestId('notification-preferences-loading')).toBeTruthy();
    queryClient.clear();
  });

  it('renders every category from the catalogue, in two sections', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { findByTestId, getByTestId, queryClient } = renderScreen();

    expect(await findByTestId('notification-preferences-screen')).toBeTruthy();
    for (const row of catalogue) {
      expect(getByTestId(`preference-row-${row.category}`)).toBeTruthy();
    }
    expect(getByTestId('notification-preferences-mutable')).toBeTruthy();
    expect(getByTestId('notification-preferences-critical')).toBeTruthy();
    queryClient.clear();
  });

  it('labels the sections and carries the Figma copy', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { findByTestId, getByText, queryClient } = renderScreen();

    await findByTestId('notification-preferences-screen');
    expect(getByText('تفضيلات الإشعارات')).toBeTruthy();
    expect(getByText('قابلة للكتم')).toBeTruthy();
    expect(getByText('حساسة للحساب — لا تُكتم')).toBeTruthy();
    expect(getByText('تذكير التقرير اليومي')).toBeTruthy();
    expect(getByText('إشعار مسائي إن لم تُرسل تقرير اليوم')).toBeTruthy();
    expect(getByText('الإزالة من المجموعة')).toBeTruthy();
    queryClient.clear();
  });

  it('renders a toggle for a mutable row and NONE for an account-critical one', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { findByTestId, queryByTestId, queryClient } = renderScreen();

    expect(await findByTestId('preference-row-N-01-toggle')).toBeTruthy();
    for (const critical of ['N-03', 'N-04', 'N-08']) {
      expect(queryByTestId(`preference-row-${critical}-toggle`)).toBeNull();
    }
    queryClient.clear();
  });

  it('reflects the stored mute state on the toggle', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);

    const { findByTestId, getByTestId, queryClient } = renderScreen();

    const muted = await findByTestId('preference-row-N-02-toggle');
    expect(muted.props.accessibilityState.checked).toBe(true);
    expect(
      getByTestId('preference-row-N-01-toggle').props.accessibilityState
        .checked,
    ).toBe(false);
    queryClient.clear();
  });

  it('mutes a category through API-051 with no confirmation dialog (UF §25)', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockResolvedValue({ ...catalogue[0], muted: true });

    const { findByTestId, queryClient } = renderScreen();

    fireEvent.press(await findByTestId('preference-row-N-01-toggle'));

    // TanStack v5 hands the mutationFn a second (context) argument.
    await waitFor(() =>
      expect(preferencesApi.setNotificationPreference).toHaveBeenCalledWith(
        { category: 'N-01', muted: true },
        expect.anything(),
      ),
    );
    queryClient.clear();
  });

  it('unmutes a muted category', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockResolvedValue({ ...catalogue[1], muted: false });

    const { findByTestId, queryClient } = renderScreen();

    fireEvent.press(await findByTestId('preference-row-N-02-toggle'));

    await waitFor(() =>
      expect(preferencesApi.setNotificationPreference).toHaveBeenCalledWith(
        { category: 'N-02', muted: false },
        expect.anything(),
      ),
    );
    queryClient.clear();
  });

  it('holds the toggle in its requested position while the write is in flight', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    jest
      .spyOn(preferencesApi, 'setNotificationPreference')
      .mockImplementation(() => new Promise(() => {}));

    const { findByTestId, getByTestId, queryClient } = renderScreen();

    fireEvent.press(await findByTestId('preference-row-N-01-toggle'));

    await waitFor(() =>
      expect(
        getByTestId('preference-row-N-01-toggle').props.accessibilityState
          .checked,
      ).toBe(true),
    );
    // Disabled until the write settles, so a double tap cannot race itself.
    expect(
      getByTestId('preference-row-N-01-toggle').props.accessibilityState
        .disabled,
    ).toBe(true);
    queryClient.clear();
  });

  it('surfaces a failed write as an error banner, never a silent no-op (UF §24)', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    jest.spyOn(preferencesApi, 'setNotificationPreference').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'internal detail that must never reach the user',
      }),
    );

    const { findByTestId, findByText, queryByText, queryClient } =
      renderScreen();

    fireEvent.press(await findByTestId('preference-row-N-01-toggle'));

    expect(
      await findByTestId('notification-preferences-save-error'),
    ).toBeTruthy();
    expect(
      await findByText('حدث خطأ أثناء تحديث تفضيلات الإشعارات'),
    ).toBeTruthy();
    // 5xx never leaks the server's own message (UF §24).
    expect(
      queryByText('internal detail that must never reach the user'),
    ).toBeNull();
    queryClient.clear();
  });

  it('shows the 4xx Arabic message verbatim (UF §24)', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockResolvedValue(catalogue);
    jest.spyOn(preferencesApi, 'setNotificationPreference').mockRejectedValue(
      new ApiError({
        statusCode: 422,
        error: 'ACCOUNT_CRITICAL_CATEGORY',
        message: 'هذه الفئة حساسة للحساب ولا يمكن كتمها',
      }),
    );

    const { findByTestId, findByText, queryClient } = renderScreen();

    fireEvent.press(await findByTestId('preference-row-N-01-toggle'));

    expect(
      await findByText('هذه الفئة حساسة للحساب ولا يمكن كتمها'),
    ).toBeTruthy();
    queryClient.clear();
  });

  it('shows the generic network copy on a transport failure (UF §24)', async () => {
    jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockRejectedValue(new NetworkError());

    const { findByTestId, findByText, queryClient } = renderScreen();

    expect(
      await findByTestId('notification-preferences-load-error'),
    ).toBeTruthy();
    expect(
      await findByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();
    queryClient.clear();
  });

  it('never shows a 5xx server message on load, and retries (UF §24)', async () => {
    const getSpy = jest
      .spyOn(preferencesApi, 'getNotificationPreferences')
      .mockRejectedValue(
        new ApiError({
          statusCode: 503,
          error: 'SERVICE_UNAVAILABLE',
          message: 'pg: connection refused',
        }),
      );

    const { findByTestId, queryByText, getByTestId, queryClient } =
      renderScreen();

    await findByTestId('notification-preferences-load-error');
    expect(queryByText('pg: connection refused')).toBeNull();

    getSpy.mockResolvedValue(catalogue);
    fireEvent.press(
      getByTestId('notification-preferences-load-error-retry-button'),
    );

    expect(await findByTestId('notification-preferences-screen')).toBeTruthy();
    queryClient.clear();
  });

  it('falls back to the API description for a category it does not know', async () => {
    jest.spyOn(preferencesApi, 'getNotificationPreferences').mockResolvedValue([
      {
        category: 'N-99',
        description: 'وصف من الخادم',
        is_mutable: true,
        muted: false,
      },
    ]);

    const { findByText, queryClient } = renderScreen();

    expect(await findByText('وصف من الخادم')).toBeTruthy();
    queryClient.clear();
  });
});
