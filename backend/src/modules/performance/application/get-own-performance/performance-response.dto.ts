/**
 * API-037 / API-039 payload (`PerformanceDto`, TS §13; APIS §10.9).
 *
 * EVERY rate is nullable and is `null` — never `0` — when its denominator
 * is empty (DEC-B04 / API-X07). The client renders null as "not enough
 * data" (UF §17), never `0%`.
 */
export interface PerformanceDayBreakdownDto {
  normal: number;
  revision: number;
  absent_excused: number;
  absent_other: number;
  no_report: number;
}

export interface PerformanceDto {
  /** VO-06's mean of the defined components; null when none is defined. */
  commitment_score: number | null;
  submission_rate: number | null;
  memorization_rate: number | null;
  revision_rate: number | null;
  attendance_rate: number | null;
  /** Standalone quality indicator, never folded into the score (SAS §18.3). */
  repetition_quality: number | null;
  /** VO-09 tally over the period's expected days; sums to their count. */
  day_breakdown: PerformanceDayBreakdownDto;
  /** Expected days since the last report — not raw calendar days (SAS §18.4). */
  days_since_last_report: number;
}

/** APIS §9.1 single-resource envelope. */
export interface GetOwnPerformanceResponseDto {
  data: PerformanceDto;
}
