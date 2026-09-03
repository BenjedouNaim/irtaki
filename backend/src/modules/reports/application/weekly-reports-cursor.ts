import { decodeCursor } from '../../../shared/pagination/cursor.util';
import { WeeklyReportsCursor } from '../domain/weekly-report.repository.interface';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared by API-035 and API-036 — the weekly twin of
 * `parseDailyReportsCursor`. An opaque cursor that does not decode to
 * exactly `{ id: uuid, sortKey: { weekStart: YYYY-MM-DD } }` is treated as
 * "first page" rather than rejected — the same posture as APIS §9.2's
 * limit clamping. It is also what keeps a tampered value away from the
 * `::uuid` / `::date` casts in the query.
 */
export function parseWeeklyReportsCursor(
  raw?: string,
): WeeklyReportsCursor | null {
  const decoded = decodeCursor<{ weekStart?: unknown }>(raw);
  if (!decoded || !UUID.test(decoded.id)) {
    return null;
  }
  const weekStart = decoded.sortKey?.weekStart;
  if (typeof weekStart !== 'string' || !ISO_DATE.test(weekStart)) {
    return null;
  }
  return { id: decoded.id, sortKey: { weekStart } };
}
