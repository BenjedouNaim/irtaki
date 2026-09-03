import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AuditActionName,
  AuditLogResponse,
  listAuditEntries,
} from '@/shared/api/audit.client';
import { useAuthStore } from '@/shared/auth';

/**
 * SCR-33's action filter (Figma 42:597): "الكل" plus the three audited
 * actions. `all` sends no `action` param and gets all three; anything else
 * is APIS §9.3's `action` filter. No fourth value exists or ever will
 * without a SAS-level change to DEC-D05 (APIS §9.9, RISK-08).
 */
export type AuditActionFilter = 'all' | AuditActionName;

/** APIS §9.2 default page size, and what the list scrolls in. */
export const AUDIT_PAGE_SIZE = 20;

/** Query-key root for the audit log (TS §26). */
export const AUDIT_QUERY_KEY = ['audit'] as const;

/**
 * Keyed by endpoint + params (TS §26), and by viewer so a page fetched by
 * one account is never shown to another.
 */
export function auditLogQueryKey(
  action: AuditActionFilter,
  userId?: string | null,
) {
  return [...AUDIT_QUERY_KEY, action, userId ?? 'anonymous'] as const;
}

export type AuditLogQueryKey = ReturnType<typeof auditLogQueryKey>;

/**
 * F-ADM-03 / API-054 — the Admin's audit log, `occurred_at DESC`
 * (APIS §9.4), cursor-paginated as SA §15's API-X04 requires: page param =
 * the opaque `next_cursor`, `undefined` for the first page, none once
 * `has_more` is false. Pages are flattened because SCR-33 is one flat
 * chronological list (UF §28).
 *
 * `from`/`to` exist on the endpoint (APIS §9.3) but SCR-33 offers no date
 * control, so the hook never sends them.
 */
export function useAuditLog(action: AuditActionFilter) {
  const userId = useAuthStore((s) => s.userId);

  return useInfiniteQuery<
    AuditLogResponse,
    Error,
    AuditLogResponse['data'],
    AuditLogQueryKey,
    string | undefined
  >({
    queryKey: auditLogQueryKey(action, userId),
    queryFn: ({ pageParam }) =>
      listAuditEntries({
        ...(action === 'all' ? {} : { action }),
        limit: AUDIT_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more && lastPage.pagination.next_cursor
        ? lastPage.pagination.next_cursor
        : undefined,
    select: (result) => result.pages.flatMap((page) => page.data),
  });
}
