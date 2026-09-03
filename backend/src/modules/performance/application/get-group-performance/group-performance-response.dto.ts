/**
 * API-038 payload (`GroupPerformanceDto`, TS §13; APIS §10.9):
 * `{ commitment_average, students: [{ membership_id, full_name,
 * commitment_score }] (weakest-first), absence_breakdown, submission_rate }`.
 *
 * Every rate is nullable and is `null` — never `0` — when its denominator is
 * empty (DEC-B04 / API-X07). The client renders null as "not enough data"
 * (UF §17, §23), never `0%`.
 */
export interface GroupStudentPerformanceDto {
  membership_id: string;
  /** `users.full_name`; null when the student never completed their profile. */
  full_name: string | null;
  /** VO-06's mean of the defined components; null when none is defined. */
  commitment_score: number | null;
}

/** The AbsenceReason tally over the period's expected days (VR-19's enum). */
export interface GroupAbsenceBreakdownDto {
  sick: number;
  studying: number;
  other: number;
}

export interface GroupPerformanceDto {
  /** Mean of the members' DEFINED scores; null when none is defined (UC-07 5a). */
  commitment_average: number | null;
  /** Ascending by `commitment_score` — weakest first (UF §17, AC-15). */
  students: GroupStudentPerformanceDto[];
  absence_breakdown: GroupAbsenceBreakdownDto;
  /** Pooled over the member set; null when the group had no effective days. */
  submission_rate: number | null;
}

/** APIS §9.1 single-resource envelope. */
export interface GetGroupPerformanceResponseDto {
  data: GroupPerformanceDto;
}
