import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * `device_tokens` (DBT-14). The one table in this schema from which rows
 * are PHYSICALLY deleted (DBD §25, ADR-007) — it therefore carries no
 * `deleted_at`; `invalidated_at` is the separate logical state.
 */
@Entity('device_tokens')
export class DeviceTokenTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar' })
  token!: string;

  @Column({ type: 'varchar' })
  platform!: string;

  @Column({ name: 'registered_at', type: 'timestamptz' })
  registeredAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt!: Date | null;
}
