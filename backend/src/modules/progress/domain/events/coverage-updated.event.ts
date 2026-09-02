import { CoverageInterval } from '../coverage-set';

/**
 * DE-06 CoverageUpdated (DMS §17) — effect of DE-05 when a memorisation range
 * is present. Producer: DS-05 MemorizationProgressEngine. Status: Useful (no
 * consumer today; the individual dashboard reads the materialised row).
 */
export class CoverageUpdatedEvent {
  static readonly EVENT_NAME = 'coverage.updated';

  constructor(
    public readonly membershipId: string,
    public readonly intervals: readonly CoverageInterval[],
    public readonly ahzabCompleted: number,
  ) {}
}
