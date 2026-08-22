import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('groups')
export class GroupTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  name!: string;

  @Column({ type: 'varchar' })
  gender!: string;

  @Column({ name: 'recitation_day', type: 'smallint' })
  recitationDay!: number;

  @Column({
    name: 'enrollment_status',
    type: 'varchar',
    default: 'Open',
  })
  enrollmentStatus!: string;

  @Column({
    name: 'lifecycle_state',
    type: 'varchar',
    default: 'Active',
  })
  lifecycleState!: string;

  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'assistant_id', type: 'uuid' })
  assistantId!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
