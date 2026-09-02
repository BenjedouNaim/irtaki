import { AyahPosition, totalAyahCount } from '../domain/ayah-position';
import { CoverageRecord } from '../domain/coverage.repository.interface';
import { MemorizationProgressEngine } from '../domain/memorization-progress-engine';
import { SurahRecord } from '../domain/surah.repository.interface';
import { toCoverageSet } from './coverage-set.mapper';
import { ProgressDto } from './get-own-progress/get-own-progress-response.dto';

/**
 * Folds a persisted coverage row into the API-041/042 wire shape (APIS §11:
 * `DomainEntity ↛ ResponseDTO`, built by an application-layer mapper).
 *
 * - `ahzab_completed` is the stored cached derivation (DBD §12) — recomputed
 *   only on the DS-05 write path, never here.
 * - `coverage_percent` is derived at read time (no column exists for it).
 * - `last_memorized_position` is reconstructed from the stored ordinal.
 */
export function toProgressDto(
  record: CoverageRecord,
  surahs: readonly SurahRecord[],
): ProgressDto {
  const coverage = toCoverageSet(record.intervals, surahs);

  const lastPosition =
    record.lastMemorizedOrdinal == null
      ? null
      : AyahPosition.fromOrdinal(record.lastMemorizedOrdinal, surahs);

  return {
    ahzab_completed: record.ahzabCompleted,
    coverage_percent: MemorizationProgressEngine.computeCoveragePercent(
      coverage,
      totalAyahCount(surahs),
    ),
    last_memorized_position: lastPosition
      ? {
          surah: lastPosition.surah,
          ayah: lastPosition.ayah,
          ordinal: lastPosition.ordinal,
        }
      : null,
    is_activity_pointer_only: true,
  };
}
