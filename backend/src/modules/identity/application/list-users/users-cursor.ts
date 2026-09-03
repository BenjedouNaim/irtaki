import { decodeCursor } from '../../../../shared/pagination/cursor.util';
import { UsersCursor } from '../../domain/user.repository.interface';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * The exact shape the repository projects its sort key in: an ISO-8601 UTC
 * instant with microsecond precision, so the keyset comparison never loses
 * the sub-millisecond part of `users.created_at` and never skips or repeats
 * a row across a page boundary.
 */
const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/**
 * API-053's opaque cursor (APIS §9.2: base64 of `{id, sort_key}` of the last
 * item on the previous page). A value that does not decode to exactly
 * `{ id: uuid, sortKey: { createdAt } }` is treated as "first page" rather
 * than rejected — the same posture as §9.2's limit clamping and the
 * `parseDailyReportsCursor` precedent. It is also what keeps a tampered
 * value away from the `::timestamptz` / `::uuid` casts in the query.
 */
export function parseUsersCursor(raw?: string): UsersCursor | null {
  const decoded = decodeCursor<{ createdAt?: unknown }>(raw);
  if (!decoded || !UUID.test(decoded.id)) {
    return null;
  }
  const createdAt = decoded.sortKey?.createdAt;
  if (typeof createdAt !== 'string' || !CREATED_AT.test(createdAt)) {
    return null;
  }
  return { id: decoded.id, sortKey: { createdAt } };
}
