import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('memberships')
export class MembershipTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @Column({ name: 'join_request_id', type: 'uuid', nullable: true })
  joinRequestId!: string | null;

  @Column({ type: 'varchar', default: 'Active' })
  state!: string;

  @Column({ name: 'started_at', type: 'date' })
  startedAt!: string;

  @Column({ name: 'ended_at', type: 'date', nullable: true })
  endedAt!: string | null;

  @Column({ name: 'ended_by', type: 'uuid', nullable: true })
  endedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
