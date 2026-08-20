import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('audit_entries')
@Index('idx_audit_entries_actor_occurred', ['actorId', 'occurredAt'])
export class AuditEntryTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId!: string;

  @Column({ type: 'varchar' })
  action!: 'ENROLLMENT_TOGGLED' | 'GROUP_CREATED' | 'LOGIN';

  @Column({ name: 'target_type', type: 'varchar', nullable: true })
  targetType!: string | null;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId!: string | null;

  @Column({ name: 'previous_value', type: 'jsonb', nullable: true })
  previousValue!: Record<string, unknown> | null;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
