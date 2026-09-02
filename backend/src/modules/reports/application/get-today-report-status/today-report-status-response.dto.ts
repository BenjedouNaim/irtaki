import { DailyReportBlockReason } from '../../domain/daily-report-eligibility';
import { DailyReportDto } from '../daily-report.dto';

/**
 * API-029 payload (APIS §10.7):
 * `{ can_submit, block_reason?, existing_report? }`. Optional keys are
 * omitted, not nulled — `block_reason` only when blocked, `existing_report`
 * only for `already_submitted`.
 */
export interface TodayReportStatusDto {
  can_submit: boolean;
  block_reason?: DailyReportBlockReason;
  existing_report?: DailyReportDto;
}

/** APIS §9.1 single-resource envelope. */
export interface TodayReportStatusResponseDto {
  data: TodayReportStatusDto;
}
