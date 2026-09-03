import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as usersApi from '@/shared/api/users.client';
import { ApiError, NetworkError } from '@/shared/api/types';
import { StaffUsersListScreen } from '../StaffUsersListScreen';

jest.mock('@/shared/api/users.client');

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  router: { back: () => mockBack() },
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
}));

function user(
  id: string,
  role: string,
  full_name: string | null = `مستخدم ${id}`,
): usersApi.UserListItem {
  return { id, email: `${id}@example.com`, full_name, role };
}

const firstPage: usersApi.ListUsersResponse = {
  data: [user('u3', 'Teacher'), user('u2', 'User', null)],
  pagination: { next_cursor: 'cursor-2', has_more: true },
};
const lastPage: usersApi.ListUsersResponse = {
  data: [user('u1', 'Student')],
  pagination: { next_cursor: null, has_more: false },
};

let queryClient: QueryClient;

function renderScreen() {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <StaffUsersListScreen />
    </QueryClientProvider>,
  );
}

describe('StaffUsersListScreen (SCR-32, F-ADM-02, Figma 42:395)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    queryClient?.clear();
  });

  it('opens on "الكل", asking API-053 for the unfiltered first page', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(firstPage);
    renderScreen();

    expect(screen.getByTestId('staff-users-top-bar-title').props.children).toBe(
      'الطاقم والمستخدمون',
    );
    expect(
      screen.getByTestId('users-filter-all').props.accessibilityState.selected,
    ).toBe(true);
    expect(await screen.findByTestId('user-row-u3')).toBeTruthy();
    expect(usersApi.listUsers).toHaveBeenCalledWith({ limit: 20 });
  });

  it('shows a layout-matched skeleton before the first page arrives (UF §22)', async () => {
    let release: (page: usersApi.ListUsersResponse) => void = () => {};
    jest.spyOn(usersApi, 'listUsers').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    renderScreen();

    expect(screen.getByTestId('staff-users-list-skeleton')).toBeTruthy();
    expect(screen.queryByTestId('staff-users-list-list')).toBeNull();

    release(firstPage);
    expect(await screen.findByTestId('user-row-u3')).toBeTruthy();
  });

  it('enables the promote action on the role=User row only (BR-R03)', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(firstPage);
    renderScreen();

    await screen.findByTestId('user-row-u2');
    expect(screen.getByTestId('promote-user-u2-button')).toBeTruthy();
    expect(screen.queryByTestId('promote-user-u3-button')).toBeNull();
    expect(screen.getByTestId('user-row-u3-badge')).toBeTruthy();
  });

  it('re-reads the directory with the APIS §9.3 role filter when a chip is tapped', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(firstPage);
    renderScreen();
    await screen.findByTestId('user-row-u3');

    jest.spyOn(usersApi, 'listUsers').mockResolvedValue(lastPage);
    fireEvent.press(screen.getByTestId('users-filter-Teacher'));

    await waitFor(() =>
      expect(usersApi.listUsers).toHaveBeenLastCalledWith({
        role: 'Teacher',
        limit: 20,
      }),
    );
    expect(
      screen.getByTestId('users-filter-Teacher').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('loads the next page from the server cursor when the list reaches its end', async () => {
    jest
      .spyOn(usersApi, 'listUsers')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(lastPage);
    renderScreen();
    await screen.findByTestId('user-row-u3');

    fireEvent(screen.getByTestId('staff-users-list-list'), 'onEndReached');

    expect(await screen.findByTestId('user-row-u1')).toBeTruthy();
    expect(usersApi.listUsers).toHaveBeenLastCalledWith({
      limit: 20,
      cursor: 'cursor-2',
    });
  });

  it('shows the factual empty state when a role filter matches nobody (UF §23)', async () => {
    jest.spyOn(usersApi, 'listUsers').mockResolvedValue({
      data: [],
      pagination: { next_cursor: null, has_more: false },
    });
    renderScreen();
    await screen.findByTestId('staff-users-list-empty');

    expect(screen.getByText('لا مستخدمين بعد')).toBeTruthy();

    fireEvent.press(screen.getByTestId('users-filter-Assistant'));
    expect(await screen.findByText('لا مستخدمين بهذا الدور بعد')).toBeTruthy();
  });

  it('shows the generic Arabic copy on a 5xx, never the server message (UF §24)', async () => {
    jest.spyOn(usersApi, 'listUsers').mockRejectedValue(
      new ApiError({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'relation "users" does not exist',
      }),
    );
    renderScreen();

    expect(await screen.findByTestId('staff-users-list-error')).toBeTruthy();
    expect(
      screen.getByText('حدث خطأ أثناء تحميل قائمة المستخدمين'),
    ).toBeTruthy();
    expect(screen.queryByText('relation "users" does not exist')).toBeNull();
  });

  it('shows the network retry copy and retries on demand (UF §24)', async () => {
    const listUsers = jest
      .spyOn(usersApi, 'listUsers')
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValue(firstPage);
    renderScreen();

    await screen.findByTestId('staff-users-list-error');
    expect(
      screen.getByText('تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('staff-users-list-error-retry-button'));

    expect(await screen.findByTestId('user-row-u3')).toBeTruthy();
    expect(listUsers).toHaveBeenCalledTimes(2);
  });
});
