import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { RootNavigator } from '../RootNavigator';
import { ROLE_HOME_ROUTES, homeRouteForRole } from '../roleHome';
import { useAuthStore } from '../../shared/auth/authStore';
import type { Role } from '../../shared/auth/types';

// `Redirect` renders nothing observable, so the mock surfaces its `href` as
// text — the routing decision IS what these tests assert.
jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: unknown }) =>
      ReactModule.createElement(Text, { testID: 'redirect' }, String(href)),
  };
});

/** UF §7's role → Home mapping, restated here so a drift is visible. */
const ROLE_HOMES: Array<{ role: Role; screen: string; route: string }> = [
  { role: 'User', screen: 'SCR-05', route: '/(app)/user' },
  { role: 'Student', screen: 'SCR-08', route: '/(app)/student' },
  { role: 'Assistant', screen: 'SCR-17', route: '/(app)/assistant' },
  { role: 'Teacher', screen: 'SCR-22', route: '/(app)/teacher' },
  { role: 'Admin', screen: 'SCR-26', route: '/(app)/admin' },
];

describe('RootNavigator (F-DASH-02)', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('sends an unauthenticated caller to Login (SCR-01)', () => {
    render(<RootNavigator />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/(auth)/login');
  });

  it.each(ROLE_HOMES)(
    'routes $role to their Home ($screen)',
    ({ role, route }) => {
      useAuthStore.getState().setSession('token', role);

      render(<RootNavigator />);

      expect(screen.getByTestId('redirect')).toHaveTextContent(route);
    },
  );

  it('sends a session with no role to Login rather than guessing', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      role: null,
      accessToken: 'token',
    });

    render(<RootNavigator />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/(auth)/login');
  });
});

describe('roleHome (F-DASH-02 — the single role → route map)', () => {
  it('maps every role exactly once, with no duplicate destination', () => {
    const routes = Object.values(ROLE_HOME_ROUTES);

    expect(Object.keys(ROLE_HOME_ROUTES).sort()).toEqual([
      'Admin',
      'Assistant',
      'Student',
      'Teacher',
      'User',
    ]);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it.each(ROLE_HOMES)(
    'resolves $role to $route ($screen)',
    ({ role, route }) => {
      expect(homeRouteForRole(role)).toBe(route);
    },
  );

  it('falls back to Login for a missing role (UF §9 cold start)', () => {
    expect(homeRouteForRole(null)).toBe('/(auth)/login');
    expect(homeRouteForRole(undefined)).toBe('/(auth)/login');
  });
});
