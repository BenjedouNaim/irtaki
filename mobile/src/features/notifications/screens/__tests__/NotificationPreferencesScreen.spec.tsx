import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
