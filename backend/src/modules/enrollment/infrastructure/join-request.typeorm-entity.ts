import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity('join_requests')
export class JoinRequestTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName!: string;

  @Column({ type: 'varchar' })
  gender!: string;

  @Column({ type: 'integer' })
  age!: number;

  @Column({ name: 'phone_number', type: 'varchar' })
  phoneNumber!: string;

  @Column({ type: 'varchar' })
  occupation!: string;

  @Column({ type: 'varchar' })
  city!: string;

  @Column({ name: 'memorized_hizb_count', type: 'smallint' })
  memorizedHizbCount!: number;

  @Column({ name: 'tajweed_level', type: 'varchar' })
  tajweedLevel!: string;

  @Column({ name: 'studied_tajweed_theory', type: 'boolean' })
  studiedTajweedTheory!: boolean;

  @Column({ name: 'studied_qalun', type: 'boolean' })
  studiedQalun!: boolean;

  @Column({ name: 'fee_agreement', type: 'boolean' })
  feeAgreement!: boolean;

  @Column({ name: 'program_goal', type: 'varchar' })
  programGoal!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  score!: number;

  @Column({ type: 'varchar', default: 'Pending' })
  status!: string;

  @Column({ name: 'resolution_source', type: 'varchar', nullable: true })
  resolutionSource!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
