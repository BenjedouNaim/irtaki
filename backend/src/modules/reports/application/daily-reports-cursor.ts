import { decodeCursor } from '../../../shared/pagination/cursor.util';
import { DailyReportsCursor } from '../domain/daily-report.repository.interface';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Shared by API-031 and API-032. An opaque cursor that does not decode to
 * exactly `{ id: uuid, sortKey: { reportDate: YYYY-MM-DD } }` is treated as
 * "first page" rather than rejected — the same posture as APIS §9.2's limit
 * clamping and the ListPendingJoinRequestsUseCase precedent. It is also
 * what keeps a tampered value away from the `::uuid` / `::date` casts in
 * the query.
 */
export function parseDailyReportsCursor(
  raw?: string,
): DailyReportsCursor | null {
  const decoded = decodeCursor<{ reportDate?: unknown }>(raw);
  if (!decoded || !UUID.test(decoded.id)) {
    return null;
  }
  const reportDate = decoded.sortKey?.reportDate;
  if (typeof reportDate !== 'string' || !ISO_DATE.test(reportDate)) {
    return null;
  }
  return { id: decoded.id, sortKey: { reportDate } };
}
