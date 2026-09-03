import type { Href } from 'expo-router';
import type { Role } from '@/shared/auth';

/**
 * F-DASH-02 — the ONE place that answers "where does this role live?".
 *
 * UF §8's navigation architecture gives each role exactly one Home, and
 * TSQ-02/TDR-05 settled how the app picks it: the server's `dashboard_route`
 * hint was **dropped**, and "mobile routes from `role` alone (UF §9)". Every
 * post-authentication redirect in the app — the entry route, the auth
 * layout's bounce-out, and the post-login and post-registration replaces —
 * reads this map, so the five destinations cannot drift apart the way four
 * hand-copied `switch` statements did.
 *
 * `Record<Role, Href>` is exhaustive by construction: a sixth role would
 * fail to compile here rather than silently fall through a `default` branch
 * to the wrong screen.
 */
export const ROLE_HOME_ROUTES: Record<Role, Href> = {
  /** SCR-05 User Home — status card + join entry point. */
  User: '/(app)/user',
  /** SCR-08 Student Home — the daily hub. */
  Student: '/(app)/student',
  /** SCR-17 Assistant Home — the entry hub. */
  Assistant: '/(app)/assistant',
  /** SCR-22 Teacher Home — the groups list itself (UF §10). */
  Teacher: '/(app)/teacher',
  /** SCR-26 Admin Home — the menu hub. */
  Admin: '/(app)/admin',
};

/** Where an unauthenticated caller belongs (SCR-01). */
export const LOGIN_ROUTE: Href = '/(auth)/login';

/**
 * The Home route of an authenticated role. A caller with no session — or a
 * persisted role string the app no longer recognises — is sent to Login
 * rather than guessed at: UF §9's cold-start flow treats an unresolvable
 * session as no session.
 */
export function homeRouteForRole(role: Role | null | undefined): Href {
  if (!role) {
    return LOGIN_ROUTE;
  }
  return ROLE_HOME_ROUTES[role] ?? LOGIN_ROUTE;
}
