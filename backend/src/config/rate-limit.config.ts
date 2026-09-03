import { ThrottlerModuleOptions, seconds } from '@nestjs/throttler';

/**
 * Rate limiting (APIS §9.8, SA §15 / NFR-22, TS §16).
 *
 * Exactly two scopes are throttled for MVP and no others:
 *
 * | Scope                   | Endpoint(s)           | Tracked by | Reason                        |
 * |-------------------------|-----------------------|------------|-------------------------------|
 * | Authentication          | `/auth/*`             | client IP  | Credential stuffing           |
 * | Join request submission | `POST /join-requests` | user id    | Queue flooding (ISS-19)       |
 *
 * TS §16 states the join-request limit is "per-user", which is why that
 * throttler keys on the authenticated caller rather than the IP; `/auth/*`
 * has no authenticated caller yet, so it can only key on the IP.
 *
 * SAS §3201 records NFR-22's numeric target as **undefined** — no document
 * states a rate. The values below are therefore the conservative defaults
 * this implementation ships, not a documented business rule, and both are
 * overridable per environment (TS §32) without a code change.
 */
export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** `/auth/*` — requests per {@link RATE_LIMIT_WINDOW_SECONDS} per client IP. */
export const DEFAULT_AUTH_RATE_LIMIT = 10;

/** `POST /join-requests` — submissions per window per authenticated user. */
export const DEFAULT_JOIN_REQUEST_RATE_LIMIT = 5;

/** Named throttler for `/auth/*`. */
export const AUTH_THROTTLER = 'auth';

/** Named throttler for `POST /join-requests`. */
export const JOIN_REQUEST_THROTTLER = 'join-requests';

export interface RateLimitSettings {
  authPerWindow: number;
  joinRequestsPerWindow: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  authPerWindow: DEFAULT_AUTH_RATE_LIMIT,
  joinRequestsPerWindow: DEFAULT_JOIN_REQUEST_RATE_LIMIT,
};

interface TrackableRequest {
  user?: { id?: string };
  ip?: string;
}

/**
 * Builds the `ThrottlerModule` options. Kept as a pure function so the
 * security suite can assert the shipped defaults directly rather than
 * against whatever the ambient environment happens to configure.
 */
export function buildThrottlerOptions(
  settings: RateLimitSettings = DEFAULT_RATE_LIMITS,
): ThrottlerModuleOptions {
  return {
    /**
     * One budget per (scope, tracker) pair. The library's default key
     * includes the controller and handler names, which would give every
     * `/auth/*` route its own separate budget — an attacker rotating
     * between `login`, `register`, `refresh` and `password-reset/*` would
     * then get six times the allowance. APIS §9.8 scopes the limit to
     * `/auth/*` as a whole, so the handler is deliberately left out of the
     * key.
     */
    generateKey: (_context, tracker, throttlerName) =>
      `${throttlerName}:${tracker}`,
    throttlers: [
      {
        name: AUTH_THROTTLER,
        ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
        limit: settings.authPerWindow,
      },
      {
        name: JOIN_REQUEST_THROTTLER,
        ttl: seconds(RATE_LIMIT_WINDOW_SECONDS),
        limit: settings.joinRequestsPerWindow,
        // TS §16: "per-user". The route is authenticated, so `req.user` is
        // always populated by AuthGuard before this guard runs; the IP is
        // only a defensive fallback.
        getTracker: (req: Record<string, unknown>): string => {
          const request = req as TrackableRequest;
          return request.user?.id ?? request.ip ?? 'unknown';
        },
      },
    ],
  };
}
