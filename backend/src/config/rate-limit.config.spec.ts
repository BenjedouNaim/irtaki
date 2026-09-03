import { ExecutionContext } from '@nestjs/common';
import {
  AUTH_THROTTLER,
  DEFAULT_AUTH_RATE_LIMIT,
  DEFAULT_JOIN_REQUEST_RATE_LIMIT,
  JOIN_REQUEST_THROTTLER,
  RATE_LIMIT_WINDOW_SECONDS,
  buildThrottlerOptions,
} from './rate-limit.config';

interface ResolvedOptions {
  generateKey: (
    context: ExecutionContext,
    tracker: string,
    throttlerName: string,
  ) => string;
  throttlers: Array<{
    name?: string;
    limit: number;
    ttl: number;
    getTracker?: (req: Record<string, unknown>) => string;
  }>;
}

function options(
  auth = DEFAULT_AUTH_RATE_LIMIT,
  joinRequests = DEFAULT_JOIN_REQUEST_RATE_LIMIT,
): ResolvedOptions {
  return buildThrottlerOptions({
    authPerWindow: auth,
    joinRequestsPerWindow: joinRequests,
  }) as unknown as ResolvedOptions;
}

describe('buildThrottlerOptions (APIS §9.8 / NFR-22)', () => {
  it('declares exactly the two scopes APIS §9.8 throttles, in a 60s window', () => {
    const { throttlers } = options();

    expect(throttlers).toHaveLength(2);
    expect(throttlers.map((throttler) => throttler.name)).toEqual([
      AUTH_THROTTLER,
      JOIN_REQUEST_THROTTLER,
    ]);
    // `ttl` is milliseconds in @nestjs/throttler v6.
    for (const throttler of throttlers) {
      expect(throttler.ttl).toBe(RATE_LIMIT_WINDOW_SECONDS * 1000);
    }
  });

  it('takes both limits from the supplied settings', () => {
    const { throttlers } = options(7, 3);
    expect(throttlers[0].limit).toBe(7);
    expect(throttlers[1].limit).toBe(3);
  });

  it('defaults to the shipped limits', () => {
    const { throttlers } =
      buildThrottlerOptions() as unknown as ResolvedOptions;
    expect(throttlers[0].limit).toBe(DEFAULT_AUTH_RATE_LIMIT);
    expect(throttlers[1].limit).toBe(DEFAULT_JOIN_REQUEST_RATE_LIMIT);
  });

  describe('join-request tracker (TS §16: "per-user")', () => {
    function track(req: Record<string, unknown>): string {
      const tracker = options().throttlers[1].getTracker;
      expect(tracker).toBeDefined();
      return tracker!(req);
    }

    it('keys on the authenticated user id', () => {
      expect(track({ user: { id: 'user-1' }, ip: '10.0.0.1' })).toBe('user-1');
    });

    it('gives two users independent budgets from the same address', () => {
      expect(track({ user: { id: 'user-1' }, ip: '10.0.0.1' })).not.toBe(
        track({ user: { id: 'user-2' }, ip: '10.0.0.1' }),
      );
    });

    it('falls back to the address when no caller is attached', () => {
      expect(track({ ip: '10.0.0.1' })).toBe('10.0.0.1');
      expect(track({})).toBe('unknown');
    });
  });

  describe('key generation', () => {
    const context = {} as ExecutionContext;

    it('scopes the budget to the throttler, not to the individual handler', () => {
      // Otherwise `/auth/login`, `/auth/register`, `/auth/refresh` and the
      // two password-reset routes would each get their own allowance, and
      // an attacker rotating between them would get six times the budget.
      const { generateKey } = options();
      expect(generateKey(context, '10.0.0.1', AUTH_THROTTLER)).toBe(
        'auth:10.0.0.1',
      );
    });

    it('never collides across the two throttlers for the same tracker', () => {
      const { generateKey } = options();
      expect(generateKey(context, 'user-1', AUTH_THROTTLER)).not.toBe(
        generateKey(context, 'user-1', JOIN_REQUEST_THROTTLER),
      );
    });
  });
});
