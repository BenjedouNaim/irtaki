import { apiClient } from './client';

/**
 * The only three actions that are ever audited (APIS §9.9, DEC-D05) and the
 * only three values `GET /audit` can return. This is a deliberate,
 * documented gap (RISK-08) — nothing else is audited, so nothing else is
 * ever listed here.
 */
export type AuditActionName = 'LOGIN' | 'GROUP_CREATED' | 'ENROLLMENT_TOGGLED';

/** The actor reference object APIS §10.13 embeds on every entry. */
export interface AuditActor {
  id: string;
  /** Null for an account that has never carried a name (DEC-B04). */
  full_name: string | null;
}

export interface AuditEntry {
  id: string;
  actor: AuditActor;
  action: AuditActionName;
  target_type: string | null;
  target_id: string | null;
  /** ISO-8601 UTC instant. */
  occurred_at: string;
}

/** APIS §9.1 collection envelope — cursor block, no totals. */
export interface AuditLogResponse {
  data: AuditEntry[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

/**
 * API-054 `GET /audit?action=&from=&to=` query: the §9.3 filters plus the
 * §9.2 cursor params `/audit` carries as an unbounded collection (SA §15
 * API-X04). Omitting `action` returns all three. `from`/`to` are
 * `YYYY-MM-DD` and inclusive on both ends.
 */
export interface ListAuditEntriesParams {
  action?: AuditActionName;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

/**
 * One page of the audit log (API-054), `occurred_at DESC` (APIS §9.4).
 * Returns the whole `{ data, pagination }` envelope because the cursor
 * block is part of what the list screen consumes.
 */
export async function listAuditEntries(
  params: ListAuditEntriesParams = {},
): Promise<AuditLogResponse> {
  return apiClient.get<AuditLogResponse>('/audit', {
    params: {
      ...(params.action ? { action: params.action } : {}),
      ...(params.from ? { from: params.from } : {}),
      ...(params.to ? { to: params.to } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    },
  });
}
