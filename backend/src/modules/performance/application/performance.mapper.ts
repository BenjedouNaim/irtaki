import type { DayBreakdown } from '../../reports/domain/weekly-metrics-calculator';
import type { CommitmentScore } from '../domain/commitment-score';
import type {
  PerformanceDayBreakdownDto,
  PerformanceDto,
} from './get-own-performance/performance-response.dto';

export interface PerformanceView {
  score: CommitmentScore;
  repetitionQuality: number | null;
  dayBreakdown: DayBreakdown;
  daysSinceLastReport: number;
}

/**
 * Folds VO-06 and its companions into the API-037 wire shape (APIS §11:
 * `DomainEntity ↛ ResponseDTO`, built by an application-layer mapper).
 *
 * Nothing is rounded or coerced: a null component stays null (DEC-B04),
 * and a defined rate travels as the percentage the domain computed —
 * matching `coverage_percent`, the other read-time percentage on the
 * Progress tab (API-041).
 */
export function toPerformanceDto(view: PerformanceView): PerformanceDto {
  return {
    commitment_score: view.score.value,
    submission_rate: view.score.submissionRate,
    memorization_rate: view.score.memorizationRate,
    revision_rate: view.score.revisionRate,
    attendance_rate: view.score.attendanceRate,
    repetition_quality: view.repetitionQuality,
    day_breakdown: toDayBreakdownDto(view.dayBreakdown),
    days_since_last_report: view.daysSinceLastReport,
  };
}

function toDayBreakdownDto(
  breakdown: DayBreakdown,
): PerformanceDayBreakdownDto {
  return {
    normal: breakdown.normal,
    revision: breakdown.revision,
    absent_excused: breakdown.absentExcused,
    absent_other: breakdown.absentOther,
    no_report: breakdown.noReport,
  };
}
