/**
 * Raised when an ordinal interval handed to the coverage model is not a valid
 * mushaf-order range (BR-52 / VR-14a: end.ordinal >= start.ordinal, ordinals
 * are positive integers).
 */
export class InvalidCoverageIntervalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCoverageIntervalError';
  }
}

/**
 * Raised if a coverage write would violate INV-18 ("coverage never shrinks").
 * The merge algorithm cannot produce this by construction; the guard exists
 * because SA §14 classifies INV-18 as a diff-across-write invariant enforced
 * by DS-05, not by a static DB constraint.
 */
export class CoverageShrinkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverageShrinkError';
  }
}
