import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('memorization_coverage')
export class MemorizationCoverageTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @Column({ name: 'ahzab_completed', type: 'smallint', default: 0 })
  ahzabCompleted!: number;

  @Column({ name: 'last_memorized_ordinal', type: 'integer', nullable: true })
  lastMemorizedOrdinal!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
