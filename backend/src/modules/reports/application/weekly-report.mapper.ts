import { WeeklyReportRecord } from '../domain/weekly-report.repository.interface';
import { WeeklyReportDto, WeeklyReportFinalisedBy } from './weekly-report.dto';

/**
 * DBD §14: `finalised_by` "populated with the Student's user_id when they
 * confirm; left NULL when the scheduler defaults" — the one nullable column
 * that distinguishes DE-07's two trigger paths, restated as SAS E-06's enum.
 */
function toFinalisedBy(
  record: WeeklyReportRecord,
): WeeklyReportFinalisedBy | null {
  if (record.state !== 'Finalised') {
    return null;
  }
  return record.finalisedBy ? 'Student' : 'Scheduler';
}

/** Maps one stored E-06 row to `WeeklyReportDto` (APIS §10.8 field names). */
export function toWeeklyReportDto(record: WeeklyReportRecord): WeeklyReportDto {
  return {
    id: record.id,
    week_start: record.weekStart,
    week_end: record.weekEnd,
    expected_days: record.expectedDays,
    missed_daily_reports: record.missedDailyReports,
    missed_daily_memorization: record.missedDailyMemorization,
    missed_daily_revision: record.missedDailyRevision,
    missed_50_repetitions: record.missed50Repetitions,
    missed_single_session: record.missedSingleSession,
    attended_recitation_call: record.attendedRecitationCall,
    state: record.state,
    finalised_at: record.finalisedAt,
    finalised_by: toFinalisedBy(record),
  };
}
