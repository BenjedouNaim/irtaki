import type { PerformanceDto } from '../performance.dto';

export type {
  PerformanceDayBreakdownDto,
  PerformanceDto,
} from '../performance.dto';

/** APIS §9.1 single-resource envelope. */
export interface GetOwnPerformanceResponseDto {
  data: PerformanceDto;
}
