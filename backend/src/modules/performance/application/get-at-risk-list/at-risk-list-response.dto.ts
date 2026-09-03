/**
 * API-040 payload (`AtRiskEntryDto`, TS §13; APIS §10.9):
 * `[{ membership_id, full_name, days_since_last_report }]`.
 *
 * One entry per student the DEC-B05 predicate flags — nothing about the
 * students it does not. There is no `at_risk` boolean: membership of the
 * list IS the flag, which is why UF §17 has the badge "cross-referenced
 * from the at-risk endpoint, never inferred from a low score alone".
 */
export interface AtRiskEntryDto {
  membership_id: string;
  /** `users.full_name`; null when the student never completed their profile. */
  full_name: string | null;
  /**
   * Expected days since the last report — "the SAME expected-day counting
   * as `AtRisk`, not raw calendar days" (SAS §18.4, TS §24), so this figure
   * agrees with `days_since_last_report` on API-037/039 for the same
   * student. Always ≥ 3 on this list, by the predicate's own definition.
   */
  days_since_last_report: number;
}

/**
 * APIS §9.1 collection envelope for a BOUNDED collection — `{ data: [...] }`
 * with no `pagination` keys and no `total`: §9.2 lists the seven
 * cursor-paginated endpoints and API-040 is not among them, and the at-risk
 * subset of a single group's Active roster is bounded by that roster.
 */
export interface GetAtRiskListResponseDto {
  data: AtRiskEntryDto[];
}
