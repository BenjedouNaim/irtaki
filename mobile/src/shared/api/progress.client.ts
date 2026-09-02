import { apiClient } from './client';

export interface AyahPositionDto {
  surah: number;
  ayah: number;
  ordinal: number;
}

/**
 * API-041 `GET /me/progress` response (APIS.md §10.10).
 *
 * `last_memorized_position` is an ACTIVITY POINTER, not a progress pointer (DEC-D02, FR-PROG-03).
 * The API ships `is_activity_pointer_only: true` inside the payload so the client can never
 * render the position as linear progress by accident — consumers must check the flag and
 * only ever present the position as plain text.
 */
export interface ProgressDto {
  ahzab_completed: number;
  coverage_percent: number;
  last_memorized_position: AyahPositionDto | null;
  is_activity_pointer_only: true;
}

function isEnveloped(
  response: ProgressDto | { data: ProgressDto },
): response is { data: ProgressDto } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    typeof response.data === 'object' &&
    response.data !== null &&
    'ahzab_completed' in response.data
  );
}

/**
 * Fetches the caller's own memorization coverage (Student only, API-041).
 * Tolerates both the bare body (current backend convention, see `getMe`) and the
 * APIS.md §9.1 single-resource envelope `{ data: {...} }`.
 */
export async function getMyProgress(): Promise<ProgressDto> {
  const response = await apiClient.get<ProgressDto | { data: ProgressDto }>(
    '/me/progress',
  );
  return isEnveloped(response) ? response.data : response;
}
