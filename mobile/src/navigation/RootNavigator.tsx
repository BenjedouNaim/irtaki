import React from 'react';
import { Redirect } from 'expo-router';
import { useAuthStore } from '@/shared/auth';
import { LOGIN_ROUTE, homeRouteForRole } from './roleHome';

/**
 * F-DASH-02 — the app's role-based root navigator (TS §37: `navigation/`
 * holds "role-based root navigator, per SA §9's table").
 *
 * Rendered by the entry route `app/index.tsx`. It reads the authenticated
 * role from the session — never from a server-supplied route hint, which
 * TSQ-02 dropped — and redirects to that role's Home: User → SCR-05,
 * Student → SCR-08, Assistant → SCR-17, Teacher → SCR-22, Admin → SCR-26.
 * An unauthenticated caller goes to SCR-01 Login.
 *
 * It redirects rather than rendering a stack directly: the app is an
 * expo-router file tree, so the role's Home is a route (`app/(app)/…`) that
 * the router can also reach by deep link and by `router.replace` after
 * login. An earlier version of this file rendered the five Home components
 * itself, which meant the routing decision existed twice — once here, where
 * only the tests looked, and once in each route file, where the app actually
 * ran. `roleHome.ts` is now the single answer both use.
 */
export function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const role = useAuthStore((state) => state.role);

  if (!isAuthenticated || !role) {
    return <Redirect href={LOGIN_ROUTE} />;
  }

  return <Redirect href={homeRouteForRole(role)} />;
}
