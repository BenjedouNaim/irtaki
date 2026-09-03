import { AuditAction } from '../../domain/audit-action.enum';

/**
 * The actor reference object APIS §10.13 embeds on every audit entry — the
 * same `{ id, full_name }` shape `GET /groups` embeds for staff
 * (APIQ-NEW-03). `full_name` is `null` for an account that has never
 * carried one; a null is returned as null, never defaulted (DEC-B04).
 */
export class AuditActorDto {
  id!: string;
  full_name!: string | null;
}

/**
 * API-054 item shape, exactly as APIS §10.13 states it:
 * `{ id, actor: {id, full_name}, action, target_type, target_id,
 * occurred_at }`. `action` is one of the three audited actions and never
 * anything else (APIS §9.9). `target_type`/`target_id` are nullable in the
 * schema (DBD DBT-18) — `LOGIN` carries no target.
 */
export class AuditEntryDto {
  id!: string;
  actor!: AuditActorDto;
  action!: AuditAction;
  target_type!: string | null;
  target_id!: string | null;
  /** ISO-8601 UTC instant. */
  occurred_at!: string;
}

/**
 * API-054 payload — APIS §9.1 collection envelope: `AuditEntryDto[]` plus
 * the cursor block `/audit` carries as an unbounded collection (APIS §9.2,
 * SA §15 API-X04). `next_cursor` is `null` whenever `has_more` is `false`;
 * no totals are ever returned.
 */
export class GetAuditLogResponseDto {
  data!: AuditEntryDto[];
  pagination!: {
    next_cursor: string | null;
    has_more: boolean;
  };
}
