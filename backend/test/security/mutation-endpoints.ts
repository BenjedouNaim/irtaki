/**
 * F-TEST-03 — the canonical list of every mutating (POST/PATCH) route in
 * the system, plus the scanner that re-derives it from the controllers.
 *
 * The mass-assignment table is checked against {@link MUTATION_ROUTES}, and
 * {@link scanControllerMutationRoutes} re-derives the same list straight
 * from `src/**|/*.controller.ts`. A `@Post`/`@Patch` added later therefore
 * fails the security suite until it is given a mass-assignment case —
 * which is what makes "every mutation endpoint" a verifiable claim rather
 * than a hand-counted one.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Every POST/PATCH route, as `METHOD /path`. DELETE routes are excluded:
 * they carry no request body, so mass assignment does not apply to them
 * (`DELETE /groups/{id}`, `DELETE /devices/{id}`, `DELETE /memberships/{id}`).
 */
export const MUTATION_ROUTES: readonly string[] = [
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'POST /auth/password-reset/request',
  'POST /auth/password-reset/confirm',
  'PATCH /me',
  'PATCH /users/:id/role',
  'POST /join-requests',
  'POST /join-requests/:id/accept',
  'POST /join-requests/:id/reject',
  'POST /groups',
  'PATCH /groups/:id',
  'PATCH /groups/:id/lifecycle',
  'PATCH /groups/:id/staff',
  'PATCH /groups/:id/enrollment',
  'POST /devices',
  'PATCH /me/notification-preferences',
  'POST /memberships/:id/payments',
  'POST /daily-reports',
  'POST /weekly-reports/:id/confirm',
];

const CONTROLLER_DECORATOR = /@Controller\(\s*(?:'([^']*)')?\s*\)/;
const ROUTE_DECORATOR = /@(Post|Patch|Put)\(\s*(?:'([^']*)')?\s*\)/g;

function collectControllerFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectControllerFiles(full));
    } else if (entry.endsWith('.controller.ts')) {
      found.push(full);
    }
  }
  return found.sort();
}

function joinPath(prefix: string, route: string): string {
  const segments = [prefix, route].filter((part) => part.length > 0);
  return `/${segments.join('/')}`;
}

/**
 * Re-derives the mutating route list from the controller sources. Static
 * on purpose: it sees a new controller file the moment it is added, which
 * a reflection pass over an already-wired module graph would only do if
 * the module were also registered.
 */
export function scanControllerMutationRoutes(sourceRoot: string): string[] {
  const routes: string[] = [];

  for (const file of collectControllerFiles(sourceRoot)) {
    const source = readFileSync(file, 'utf8');
    const controllerMatch = CONTROLLER_DECORATOR.exec(source);
    if (!controllerMatch) {
      continue;
    }
    const prefix = controllerMatch[1] ?? '';

    ROUTE_DECORATOR.lastIndex = 0;
    let routeMatch = ROUTE_DECORATOR.exec(source);
    while (routeMatch !== null) {
      routes.push(
        `${routeMatch[1].toUpperCase()} ${joinPath(prefix, routeMatch[2] ?? '')}`,
      );
      routeMatch = ROUTE_DECORATOR.exec(source);
    }
  }

  return routes.sort();
}
