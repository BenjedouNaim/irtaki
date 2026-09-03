/**
 * F-TEST-03 — wires the error-envelope leakage guard into the WHOLE
 * integration suite (TS §36: "a shared test helper asserts this against
 * every error-path test automatically").
 *
 * Registered as `setupFilesAfterEnv` in `test/jest-e2e.json`, so it loads
 * once per test file, before any spec runs. It patches supertest's
 * `Test.prototype.assert` — the single funnel every completed supertest
 * request passes through, whether the spec awaits the promise, chains
 * `.expect()`, or passes an `.end()` callback. Every response the suite
 * ever observes is therefore checked, at every status code, on every
 * endpoint, with no per-spec opt-in.
 *
 * The spec's own expectations run first: an ordinary assertion failure
 * still reports as itself, and the leakage failure only surfaces when the
 * spec would otherwise have passed. That keeps this hook from masking
 * unrelated breakage while still failing the build on a real leak.
 */
import { Test as SupertestTest } from 'supertest';
import { describeLeak, findInternalLeak } from './no-internal-leakage';

type AssertCallback = (
  this: unknown,
  error: Error | null,
  response: SupertestResponse,
) => void;

interface SupertestResponse {
  status?: number;
  body?: unknown;
  text?: string;
  request?: { method?: string; url?: string };
}

type AssertFn = (
  this: unknown,
  responseError: Error | null,
  response: SupertestResponse,
  callback?: AssertCallback,
) => unknown;

interface PatchableTestPrototype {
  assert: AssertFn;
  __noInternalLeakagePatched__?: boolean;
}

function leakageErrorFor(response: SupertestResponse): Error | null {
  if (!response) {
    return null;
  }
  const leak =
    findInternalLeak(response.body) ?? findInternalLeak(response.text);
  if (!leak) {
    return null;
  }
  return new Error(
    describeLeak(leak, {
      method: response.request?.method,
      path: response.request?.url,
      status: response.status,
    }),
  );
}

const prototype = SupertestTest.prototype as unknown as PatchableTestPrototype;

if (!prototype.__noInternalLeakagePatched__) {
  const originalAssert = prototype.assert;

  prototype.assert = function patchedAssert(
    this: unknown,
    responseError: Error | null,
    response: SupertestResponse,
    callback?: AssertCallback,
  ): unknown {
    return originalAssert.call(
      this,
      responseError,
      response,
      (error: Error | null, asserted: SupertestResponse) => {
        const leakage = error ? null : leakageErrorFor(asserted);
        if (callback) {
          callback.call(this, leakage ?? error, asserted);
          return;
        }
        // `.end()` with no callback: nothing downstream would ever see the
        // error, so surface it loudly rather than swallowing a real leak.
        if (leakage) {
          throw leakage;
        }
      },
    );
  };

  prototype.__noInternalLeakagePatched__ = true;
}
