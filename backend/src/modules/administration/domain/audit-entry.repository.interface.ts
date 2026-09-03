import { AuditAction } from './audit-action.enum';

export const AUDIT_ENTRY_REPOSITORY = Symbol('AUDIT_ENTRY_REPOSITORY');

/**
 * One row of the audit log as API-054 renders it: the entry plus the actor
 * reference object APIS §10.13 embeds (`actor: { id, full_name }`, the same
 * embedding pattern APIQ-NEW-03 names). `full_name` is nullable because a
 * `User` who has never applied has none — a null stays null (DEC-B04).
 *
 * `occurredAt` travels as the projected sort-key string (ISO-8601 UTC,
 * microsecond precision) rather than a `Date`, because the keyset cursor
 * must compare exactly what the database ordered by.
 */
export interface AuditLogRecord {
  id: string;
  actorId: string;
  actorFullName: string | null;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  occurredAt: string;
}

/** Keyset position in `occurred_at DESC, id DESC` (APIS §9.2/§9.4). */
export interface AuditLogCursor {
  id: string;
  sortKey: { occurredAt: string };
}

export interface FindAuditLogPageParams {
  /** APIS §9.3 `action` filter; `null` = all three audited actions. */
  action: AuditAction | null;
  /** APIS §9.3 `from`/`to`, `YYYY-MM-DD`; `null` = unbounded on that side. */
  from: string | null;
  to: string | null;
  limit: number;
  cursor: AuditLogCursor | null;
}

export interface AuditLogPage {
  rows: AuditLogRecord[];
  hasMore: boolean;
}

export interface IAuditEntryRepository {
  /**
   * API-054 — one page of the audit log, `occurred_at DESC` (APIS §9.4),
   * optionally narrowed to one action and/or a date range. The read is
   * restricted to the three audited actions inside the query itself, so no
   * other action can ever surface here (APIS §9.9, RISK-08). `hasMore` comes
   * from reading one row past `limit`, never a `COUNT(*)` (APIS §9.1: no
   * totals on any collection).
   */
  findPage(params: FindAuditLogPageParams): Promise<AuditLogPage>;
}
