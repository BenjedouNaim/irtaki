import { Inject, Injectable } from '@nestjs/common';
import {
  clampLimit,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import type {
  AuditLogCursor,
  IAuditEntryRepository,
} from '../../domain/audit-entry.repository.interface';
import { AUDIT_ENTRY_REPOSITORY } from '../../domain/audit-entry.repository.interface';
import { GetAuditLogResponseDto } from './audit-entry.dto';
import { GetAuditLogQueryDto } from './get-audit-log-query.dto';
import { parseAuditLogCursor } from './audit-log-cursor';

/**
 * F-ADM-03 / API-054 `GET /audit?action=&from=&to=` — the Admin's audit log
 * (SCR-33). Read-only: the three write points live in the modules that
 * perform the audited actions (APIS §9.9), and this use case never writes.
 *
 * `/audit` is one of SA §15's unbounded collections (API-X04), so the page
 * is cursor-paginated in the fixed `occurred_at DESC` order APIS §9.4 gives
 * this endpoint, `limit` defaulting to 20 and clamped to `[1,100]` rather
 * than rejected (APIS §9.2). The `action`, `from` and `to` filters are the
 * only ones this endpoint accepts (APIS §9.3), and the repository restricts
 * the read to the three audited actions whether or not `action` is passed —
 * no other action ever appears here (RISK-08).
 */
@Injectable()
export class GetAuditLogUseCase {
  constructor(
    @Inject(AUDIT_ENTRY_REPOSITORY)
    private readonly auditEntryRepository: IAuditEntryRepository,
  ) {}

  async execute(query: GetAuditLogQueryDto): Promise<GetAuditLogResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseAuditLogCursor(query.cursor);

    const { rows, hasMore } = await this.auditEntryRepository.findPage({
      action: query.action ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      limit,
      cursor,
    });

    const last = rows[rows.length - 1];
    const next_cursor =
      hasMore && last
        ? encodeCursor<AuditLogCursor['sortKey']>({
            id: last.id,
            sortKey: { occurredAt: last.occurredAt },
          })
        : null;

    return {
      data: rows.map((entry) => ({
        id: entry.id,
        actor: { id: entry.actorId, full_name: entry.actorFullName },
        action: entry.action,
        target_type: entry.targetType,
        target_id: entry.targetId,
        // The projected sort key keeps microsecond precision for the keyset;
        // the DTO carries the same instant in the ISO-8601 form every other
        // timestamp field uses (`submitted_at` precedent).
        occurred_at: new Date(entry.occurredAt).toISOString(),
      })),
      pagination: { next_cursor, has_more: hasMore },
    };
  }
}
