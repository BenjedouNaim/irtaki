/**
 * API-041 / API-042 payload (APIS §10.10, §11): three derived scalars plus the
 * explicit DEC-D02 warning flag. The raw interval set is never returned.
 */
export interface LastMemorizedPositionDto {
  surah: number;
  ayah: number;
  ordinal: number;
}

export interface ProgressDto {
  ahzab_completed: number;
  coverage_percent: number;
  /** `null` until the first memorisation submission after seeding. */
  last_memorized_position: LastMemorizedPositionDto | null;
  /**
   * Always `true`: `last_memorized_position` records where the student worked
   * most recently and must never be rendered as linear progress (DEC-D02).
   */
  is_activity_pointer_only: true;
}

export interface GetOwnProgressResponseDto {
  data: ProgressDto;
}
