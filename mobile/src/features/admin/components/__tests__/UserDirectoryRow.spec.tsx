import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as usersApi from '@/shared/api/users.client';
import { UserDirectoryRow, roleLabel } from '../UserDirectoryRow';

jest.mock('@/shared/api/users.client');

function renderRow(user: usersApi.UserListItem) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UserDirectoryRow user={user} />
    </QueryClientProvider>,
  );
}

function user(
  overrides: Partial<usersApi.UserListItem> = {},
): usersApi.UserListItem {
  return {
    id: 'u1',
    email: 'mounir@example.com',
    full_name: 'منير الغربي',
    role: 'User',
    ...overrides,
  };
}

describe('UserDirectoryRow (SCR-32, Figma 42:437)', () => {
  it('offers the promote action on a role=User row only (BR-R03)', () => {
    const { getByTestId, queryByTestId } = renderRow(user());

    expect(getByTestId('promote-user-u1-button')).toBeTruthy();
    // The badge slot belongs to the action on this row, not to a role label.
    expect(queryByTestId('user-row-u1-badge')).toBeNull();
  });

  it.each([
    ['Teacher', 'معلّم'],
    ['Assistant', 'مساعد'],
    ['Student', 'طالب'],
    ['Admin', 'مدير'],
  ])(
    'shows the %s role badge and no promote action — promotion would fail there',
    (role, label) => {
      const { getByTestId, queryByTestId } = renderRow(
        user({ role, full_name: 'اسم' }),
      );

      expect(queryByTestId('promote-user-u1-button')).toBeNull();
      expect(getByTestId('user-row-u1-badge')).toBeTruthy();
      expect(getByTestId('user-row-u1-badge').props.accessibilityLabel).toBe(
        `الحالة: ${label}`,
      );
      expect(roleLabel(role)).toBe(label);
    },
  );

  it('titles the row with the full name and puts the role and email underneath', () => {
    const { getByTestId } = renderRow(user({ role: 'Teacher' }));

    expect(getByTestId('user-row-u1-title').props.children).toBe('منير الغربي');
    expect(getByTestId('user-row-u1-subtitle').props.children).toBe(
      'معلّم · mounir@example.com',
    );
  });

  it('falls back to the email as the title when the account has no name yet', () => {
    const { getByTestId } = renderRow(user({ full_name: null }));

    expect(getByTestId('user-row-u1-title').props.children).toBe(
      'mounir@example.com',
    );
    // The email is already the title — the meta line stays the role alone.
    expect(getByTestId('user-row-u1-subtitle').props.children).toBe('مستخدم');
  });

  it('never clips its text when the OS font scale is raised (UF §32)', () => {
    const { getByTestId } = renderRow(user());

    expect(
      getByTestId('user-row-u1-title').props.maxFontSizeMultiplier,
    ).toBeDefined();
    expect(
      getByTestId('user-row-u1-subtitle').props.maxFontSizeMultiplier,
    ).toBeDefined();
  });
});
