import type { PerformanceDto } from '../performance.dto';

/**
 * APIS §9.1 single-resource envelope for API-039. The payload itself is
 * `PerformanceDto` verbatim — APIS §10.9: "same shape as
 * `/me/performance`" — so a change to one endpoint's contract can never
 * silently fail to reach the other (TS §13 lists `PerformanceDto` for both).
 */
export interface GetMembershipPerformanceResponseDto {
  data: PerformanceDto;
}
