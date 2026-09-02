import { AyahRange } from '../ayah-range';

/**
 * DE-06 CoverageUpdated (DMS §17) — effect of DE-05 when a memorisation range
 * is present. Producer: DS-05 MemorizationProgressEngine. Status: Useful (no
 * consumer today; the individual dashboard reads the materialised row).
 */
export class CoverageUpdatedEvent {
  static readonly EVENT_NAME = 'coverage.updated';

  constructor(
    public readonly membershipId: string,
    /** The new interval set (VO-07): disjoint, non-adjacent AyahRanges. */
    public readonly intervals: readonly AyahRange[],
    public readonly ahzabCompleted: number,
  ) {}
}
