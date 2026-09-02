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
