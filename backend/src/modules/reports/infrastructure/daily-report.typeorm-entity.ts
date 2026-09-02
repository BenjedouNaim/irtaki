import { Column, Entity, PrimaryColumn } from 'typeorm';

/** `daily_reports` (DBT-06). Immutable except `deleted_at` (DB-CHK-07). */
@Entity('daily_reports')
export class DailyReportTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @Column({ name: 'report_date', type: 'date' })
  reportDate!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'submitted_timezone', type: 'varchar' })
  submittedTimezone!: string;

  @Column({ name: 'no_memorization_today', type: 'boolean', nullable: true })
  noMemorizationToday!: boolean | null;

  @Column({ name: 'memo_from_ordinal', type: 'integer', nullable: true })
  memoFromOrdinal!: number | null;

  @Column({ name: 'memo_to_ordinal', type: 'integer', nullable: true })
  memoToOrdinal!: number | null;

  @Column({ name: 'memo_time_from', type: 'time', nullable: true })
  memoTimeFrom!: string | null;

  @Column({ name: 'memo_time_to', type: 'time', nullable: true })
  memoTimeTo!: string | null;

  @Column({ name: 'completed_50_repetitions', type: 'boolean', nullable: true })
  completed50Repetitions!: boolean | null;

  @Column({
    name: 'repetitions_in_single_session',
    type: 'boolean',
    nullable: true,
  })
  repetitionsInSingleSession!: boolean | null;

  @Column({ name: 'no_revision_today', type: 'boolean', nullable: true })
  noRevisionToday!: boolean | null;

  @Column({ name: 'rev_from_ordinal', type: 'integer', nullable: true })
  revFromOrdinal!: number | null;

  @Column({ name: 'rev_to_ordinal', type: 'integer', nullable: true })
  revToOrdinal!: number | null;

  @Column({ name: 'rev_time_from', type: 'time', nullable: true })
  revTimeFrom!: string | null;

  @Column({ name: 'rev_time_to', type: 'time', nullable: true })
  revTimeTo!: string | null;

  @Column({ name: 'read_tafsir', type: 'boolean', nullable: true })
  readTafsir!: boolean | null;

  @Column({ name: 'absence_reason', type: 'varchar', nullable: true })
  absenceReason!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
