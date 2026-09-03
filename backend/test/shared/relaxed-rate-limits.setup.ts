/**
 * Raises the APIS §9.8 throttle limits for the integration suite.
 *
 * The production defaults (`src/config/rate-limit.config.ts`) are 10
 * `/auth/*` requests and 5 join-request submissions per minute. Every
 * integration spec registers and logs in a fresh actor per test case from
 * a single loopback address, so it would exhaust the real `/auth/*` budget
 * within seconds and start reporting `429` instead of the behaviour under
 * test. Raising the limit here is a test-harness concern only: the numbers
 * come from validated environment configuration (TS §32), so nothing in
 * the application changes, and there is no bypass path in production code.
 *
 * `rate-limiting.integration.spec.ts` deliberately ignores this and builds
 * its app from `buildThrottlerOptions()` with the SHIPPED defaults, so the
 * limits that actually go to production are the ones asserted.
 */
process.env.RATE_LIMIT_AUTH_PER_MINUTE = '100000';
process.env.RATE_LIMIT_JOIN_REQUESTS_PER_MINUTE = '100000';
