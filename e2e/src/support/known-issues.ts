/**
 * Tests that encode the *specified* behaviour where the app currently differs.
 *
 * - `itKnownGap`: spec ≠ code, tracked in docs/issues (the test plan's @known-gap list).
 * - `itKnownBug`: a defect this suite found, with its GitHub issue.
 *
 * Both are skipped by default so the suite stays green on `main`; run them with
 * `E2E_INCLUDE_KNOWN=1` to check whether a fix has landed (then drop the wrapper).
 */
const includeKnown = process.env.E2E_INCLUDE_KNOWN === '1';

export function itKnownBug(title: string, issue: string, fn: Mocha.AsyncFunc): Mocha.Test {
  const full = `${title} @known-bug ${issue}`;
  return includeKnown ? it(full, fn) : it.skip(full, fn);
}

export function itKnownGap(title: string, reference: string, fn: Mocha.AsyncFunc): Mocha.Test {
  const full = `${title} @known-gap ${reference}`;
  return includeKnown ? it(full, fn) : it.skip(full, fn);
}
