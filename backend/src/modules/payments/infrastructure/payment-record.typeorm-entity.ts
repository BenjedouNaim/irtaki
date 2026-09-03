import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * `payment_records` (DBT-08) — one row per **paid** cycle only (ADR-006).
 * Fully immutable except `deleted_at` (DB-CHK-11, trigger-enforced); there
 * is no correction or reversal path (ISS-02, DBQ-02).
 */
@Entity('payment_records')
export class PaymentRecordTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @Column({ name: 'cycle_index', type: 'smallint' })
  cycleIndex!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ name: 'paid_at', type: 'timestamptz' })
  paidAt!: Date;

  @Column({ name: 'recorded_by', type: 'uuid' })
  recordedBy!: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
