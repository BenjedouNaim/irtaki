import { SurahOrdinalInfo } from '../domain/ayah-position';
import { AyahRange } from '../domain/ayah-range';
import { CoverageSet } from '../domain/coverage-set';
import { CoverageIntervalRecord } from '../domain/coverage.repository.interface';

/**
 * Rebuilds the VO-07 CoverageSet from persisted `coverage_intervals` rows
 * (ordinal pairs, DBT-10) — each row becomes a VO-02 AyahRange whose
 * endpoints are validated against the `surahs` reference data.
 */
export function toCoverageSet(
  intervals: readonly CoverageIntervalRecord[],
  surahs: readonly SurahOrdinalInfo[],
): CoverageSet {
  return CoverageSet.fromRanges(
    intervals.map((i) =>
      AyahRange.fromOrdinals(i.startOrdinal, i.endOrdinal, surahs),
    ),
  );
}
