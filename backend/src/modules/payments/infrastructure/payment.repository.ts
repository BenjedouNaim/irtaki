import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GroupLedgerContextRecord,
  IPaymentRepository,
  MembershipPaidCycleRecord,
  OwnLedgerContextRecord,
  PaidCycleRecord,
} from '../domain/payment.repository.interface';
import { PaymentRecordTypeOrmEntity } from './payment-record.typeorm-entity';

interface RawOwnLedgerContextRow {
  membership_id: string;
  started_at: string;
  ended_at: string | null;
  archived_at: string | null;
  timezone: string;
}

interface RawGroupLedgerContextRow extends RawOwnLedgerContextRow {
  full_name: string | null;
}

interface RawPaidCycleRow {
  cycle_index: number | string;
  paid_at: string;
}

interface RawMembershipPaidCycleRow extends RawPaidCycleRow {
  membership_id: string;
}

@Injectable()
export class PaymentRepository implements IPaymentRepository {
  constructor(
    @InjectRepository(PaymentRecordTypeOrmEntity)
    private readonly paymentRecordRepo: Repository<PaymentRecordTypeOrmEntity>,
  ) {}

  async findOwnLedgerContextByUserId(
    userId: string,
  ): Promise<OwnLedgerContextRecord | null> {
    // ONE parameterised, indexed lookup (TS §15.2/§36) with the scope in the
    // WHERE clause — DB-UQ-02's partial index on Active memberships. The join
    // carries the cycle clock (BR-32), both FR-PAY-12 generation stops and
    // the student's own timezone (T-01). Dates travel as text so the driver
    // never re-reads a DATE through the server timezone (T-04).
    const rows = await this.paymentRecordRepo.manager.query<
      RawOwnLedgerContextRow[]
    >(
      `SELECT m.id                AS membership_id,
              m.started_at::text  AS started_at,
              m.ended_at::text    AS ended_at,
              g.archived_at::text AS archived_at,
              u.timezone
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users  u ON u.id = m.user_id
        WHERE m.user_id = $1
          AND m.state = 'Active'
        LIMIT 1`,
      [userId],
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      membershipId: row.membership_id,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      archivedAt: row.archived_at
        ? new Date(row.archived_at).toISOString()
        : null,
      timezone: row.timezone,
    };
  }

  async findPaidCyclesByMembershipId(
    membershipId: string,
  ): Promise<PaidCycleRecord[]> {
    // DB-IDX-08 `(membership_id, cycle_index)`. Soft-deleted rows are gone
    // for every reader but the Admin recovery dump (DBD §25).
    const rows = await this.paymentRecordRepo.manager.query<RawPaidCycleRow[]>(
      `SELECT p.cycle_index,
              p.paid_at::text AS paid_at
         FROM payment_records p
        WHERE p.membership_id = $1
          AND p.deleted_at IS NULL
        ORDER BY p.cycle_index ASC`,
      [membershipId],
    );

    return (rows ?? []).map((row) => ({
      cycleIndex: Number(row.cycle_index),
      paidAt: new Date(row.paid_at).toISOString(),
    }));
  }

  async findGroupLedgerContextsByGroupId(
    groupId: string,
  ): Promise<GroupLedgerContextRecord[]> {
    // ONE parameterised, indexed lookup (TS §15.2/§36) with the scope in the
    // WHERE clause — `memberships.group_id` (DB-IDX-03). The group id was
    // already resolved by GroupPaymentsScopeGuard; the repository still
    // scopes on it rather than trusting the handler (SA §14's second layer).
    // Each row carries that student's own timezone (T-01, INV-27), so every
    // ledger is derived against its own "today". Dates travel as text so the
    // driver never re-reads a DATE through the server timezone (T-04).
    // `full_name ASC` mirrors the roster's fixed order (APIS §9.4).
    const rows = await this.paymentRecordRepo.manager.query<
      RawGroupLedgerContextRow[]
    >(
      `SELECT m.id                AS membership_id,
              m.started_at::text  AS started_at,
              m.ended_at::text    AS ended_at,
              g.archived_at::text AS archived_at,
              u.full_name,
              u.timezone
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
         JOIN users  u ON u.id = m.user_id
        WHERE m.group_id = $1
          AND m.state = 'Active'
        ORDER BY u.full_name ASC`,
      [groupId],
    );

    return (rows ?? []).map((row) => ({
      membershipId: row.membership_id,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      archivedAt: row.archived_at
        ? new Date(row.archived_at).toISOString()
        : null,
      fullName: row.full_name ?? null,
      timezone: row.timezone,
    }));
  }

  async findPaidCyclesByMembershipIds(
    membershipIds: readonly string[],
  ): Promise<MembershipPaidCycleRecord[]> {
    if (membershipIds.length === 0) {
      return [];
    }

    // One statement over the whole group (DB-IDX-08), never one per student.
    // `= ANY($1::uuid[])` keeps it a single literal parameterised query —
    // no id is ever spliced into the SQL text (TS §36).
    const rows = await this.paymentRecordRepo.manager.query<
      RawMembershipPaidCycleRow[]
    >(
      `SELECT p.membership_id,
              p.cycle_index,
              p.paid_at::text AS paid_at
         FROM payment_records p
        WHERE p.membership_id = ANY($1::uuid[])
          AND p.deleted_at IS NULL
        ORDER BY p.membership_id, p.cycle_index ASC`,
      [membershipIds as string[]],
    );

    return (rows ?? []).map((row) => ({
      membershipId: row.membership_id,
      cycleIndex: Number(row.cycle_index),
      paidAt: new Date(row.paid_at).toISOString(),
    }));
  }
}
