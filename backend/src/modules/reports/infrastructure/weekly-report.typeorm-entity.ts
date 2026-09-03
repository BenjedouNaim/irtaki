import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * `weekly_reports` (DBT-07). Immutable except `attended_recitation_call`,
 * `state`, `finalised_at`, `finalised_by`, `deleted_at` while `Open`; fully
 * immutable except `deleted_at` once `Finalised` (DB-CHK-08).
 */
@Entity('weekly_reports')
export class WeeklyReportTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @Column({ name: 'week_start', type: 'date' })
  weekStart!: string;

  @Column({ name: 'week_end', type: 'date' })
  weekEnd!: string;

  @Column({ name: 'expected_days', type: 'smallint' })
  expectedDays!: number;

  @Column({ name: 'missed_daily_reports', type: 'smallint' })
  missedDailyReports!: number;

  @Column({ name: 'missed_daily_memorization', type: 'smallint' })
  missedDailyMemorization!: number;

  @Column({ name: 'missed_daily_revision', type: 'smallint' })
  missedDailyRevision!: number;

  @Column({ name: 'missed_50_repetitions', type: 'smallint' })
  missed50Repetitions!: number;

  @Column({ name: 'missed_single_session', type: 'smallint' })
  missedSingleSession!: number;

  @Column({ name: 'attended_recitation_call', type: 'boolean' })
  attendedRecitationCall!: boolean;

  @Column({ type: 'varchar' })
  state!: string;

  @Column({ name: 'finalised_at', type: 'timestamptz', nullable: true })
  finalisedAt!: Date | null;

  @Column({ name: 'finalised_by', type: 'uuid', nullable: true })
  finalisedBy!: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
