import { apiClient } from './client';

export interface AyahPositionDto {
  surah: number;
  ayah: number;
  ordinal: number;
}

/**
 * API-041 `GET /me/progress` resource (APIS.md §10.10).
 *
 * `last_memorized_position` is an ACTIVITY POINTER, not a progress pointer (DEC-D02, FR-PROG-03).
 * The API ships `is_activity_pointer_only: true` inside the payload — it is always `true`
 * (APIS §10.10) — so the client can never render the position as linear progress by
 * accident; consumers only ever present the position as plain text.
 */
export interface ProgressDto {
  ahzab_completed: number;
  coverage_percent: number;
  last_memorized_position: AyahPositionDto | null;
  is_activity_pointer_only: true;
}

/** APIS.md §9.1 single-resource envelope. */
export interface ProgressResponse {
  data: ProgressDto;
}

/**
 * Fetches the caller's own memorization coverage (Student only, API-041) and unwraps
 * the APIS.md §9.1 single-resource envelope `{ data: {...} }`.
 */
export async function getMyProgress(): Promise<ProgressDto> {
  const response = await apiClient.get<ProgressResponse>('/me/progress');
  return response.data;
}

/**
 * Fetches ONE student's memorization coverage (API-042 — Teacher on an
 * assigned group, Admin on any) and unwraps the APIS §9.1 envelope. The
 * payload is `ProgressDto` verbatim (APIS §10.10: "`GET /me/progress` /
 * `GET /memberships/{id}/progress` → …"), so SCR-24's memorization card is
 * SCR-13's own.
 *
 * `last_memorized_position` is still an ACTIVITY POINTER here (DEC-D02) —
 * `is_activity_pointer_only` travels in this payload too.
 */
export async function getMembershipProgress(
  membershipId: string,
): Promise<ProgressDto> {
  const response = await apiClient.get<ProgressResponse>(
    `/memberships/${membershipId}/progress`,
  );
  return response.data;
}
