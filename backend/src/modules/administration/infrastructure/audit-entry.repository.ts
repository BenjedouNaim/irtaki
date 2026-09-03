import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditAction } from '../domain/audit-action.enum';
import {
  AuditLogPage,
  FindAuditLogPageParams,
  IAuditEntryRepository,
} from '../domain/audit-entry.repository.interface';

/** One raw `audit_entries` row of the API-054 projection. */
interface RawAuditLogRow {
  id: string;
  actor_id: string;
  actor_full_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  occurred_at: string;
}

@Injectable()
export class AuditEntryRepository implements IAuditEntryRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findPage(params: FindAuditLogPageParams): Promise<AuditLogPage> {
    // One literal parameterised statement (TS §36): the optional `action`
    // filter, the optional `from`/`to` bounds and the optional keyset
    // position are nullable parameters rather than appended SQL.
    //
    // The `IN` list is written into the statement rather than parameterised:
    // it is not a filter the caller controls, it is APIS §9.9's invariant —
    // exactly three actions are readable through this endpoint, so a row
    // holding any other action (the schema also admits `STAFF_REASSIGNED`)
    // can never surface here, filter or no filter (RISK-08).
    //
    // `from`/`to` are calendar dates (APIS §9.3) while `occurred_at` is an
    // instant, so each bound is anchored explicitly at UTC midnight rather
    // than left to the database session's `TimeZone`; `to` is inclusive of
    // its whole day, matching the `report_date <= to` history precedent.
    //
    // `occurred_at DESC, id DESC` is the fixed order APIS §9.4 pins to
    // `/audit`; the id tie-break (UUIDv7, time-ordered) keeps the cursor
    // stable when two entries share an instant. The sort key is projected as
    // a full-precision ISO instant so the cursor compares exactly what was
    // ordered by. `LIMIT limit + 1` derives `hasMore` without a COUNT
    // (APIS §9.1). The actor join is the reference-object embedding APIS
    // §10.13 / APIQ-NEW-03 specify; `actor_id` is `NOT NULL` with a
    // `RESTRICT` foreign key (DBD DBT-18), so it always matches a row.
    const rows = await this.dataSource.query<RawAuditLogRow[]>(
      `SELECT a.id,
              a.actor_id,
              u.full_name AS actor_full_name,
              a.action,
              a.target_type,
              a.target_id,
              to_char(a.occurred_at AT TIME ZONE 'UTC',
                      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at
         FROM audit_entries a
         JOIN users u ON u.id = a.actor_id
        WHERE a.action IN ('LOGIN', 'GROUP_CREATED', 'ENROLLMENT_TOGGLED')
          AND ($1::text IS NULL OR a.action = $1::text)
          AND ($2::date IS NULL
               OR a.occurred_at >= ($2::date)::timestamp AT TIME ZONE 'UTC')
          AND ($3::date IS NULL
               OR a.occurred_at < ($3::date + 1)::timestamp AT TIME ZONE 'UTC')
          AND ($4::timestamptz IS NULL
               OR a.occurred_at < $4::timestamptz
               OR (a.occurred_at = $4::timestamptz AND a.id < $5::uuid))
        ORDER BY a.occurred_at DESC, a.id DESC
        LIMIT $6`,
      [
        params.action,
        params.from,
        params.to,
        params.cursor?.sortKey.occurredAt ?? null,
        params.cursor?.id ?? null,
        params.limit + 1,
      ],
    );

    const hasMore = rows.length > params.limit;
    const page = hasMore ? rows.slice(0, params.limit) : rows;
    return {
      rows: page.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorFullName: row.actor_full_name,
        action: row.action as AuditAction,
        targetType: row.target_type,
        targetId: row.target_id,
        occurredAt: row.occurred_at,
      })),
      hasMore,
    };
  }
}
