import {
  DailyReportAyahPositionRecord,
  DailyReportRecord,
} from '../domain/daily-report.repository.interface';
import {
  AyahRangeDto,
  DailyReportDto,
  TimeWindowDto,
} from './daily-report.dto';

function toRange(
  from: DailyReportAyahPositionRecord | null,
  to: DailyReportAyahPositionRecord | null,
): AyahRangeDto | null {
  if (!from || !to) {
    return null;
  }
  return {
    from: { surah: from.surah, ayah: from.ayah },
    to: { surah: to.surah, ayah: to.ayah },
  };
}

function toTimeWindow(
  from: string | null,
  to: string | null,
): TimeWindowDto | null {
  if (!from || !to) {
    return null;
  }
  return { from, to };
}

/**
 * Application-layer mapper (APIS §11: every response is built by a mapper,
 * never a direct entity serialisation).
 */
export function toDailyReportDto(record: DailyReportRecord): DailyReportDto {
  return {
    id: record.id,
    report_date: record.reportDate,
    type: record.type,
    submitted_at: record.submittedAt,
    submitted_timezone: record.submittedTimezone,
    no_memorization_today: record.noMemorizationToday,
    memo_range: toRange(record.memoFrom, record.memoTo),
    memo_time: toTimeWindow(record.memoTimeFrom, record.memoTimeTo),
    completed_50_repetitions: record.completed50Repetitions,
    repetitions_in_single_session: record.repetitionsInSingleSession,
    no_revision_today: record.noRevisionToday,
    rev_range: toRange(record.revFrom, record.revTo),
    rev_time: toTimeWindow(record.revTimeFrom, record.revTimeTo),
    read_tafsir: record.readTafsir,
    absence_reason: record.absenceReason,
  };
}
