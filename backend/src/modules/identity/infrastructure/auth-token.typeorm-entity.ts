import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserTypeOrmEntity } from './user.typeorm-entity';

@Entity('auth_tokens')
export class AuthTokenTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Index('idx_auth_tokens_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserTypeOrmEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: UserTypeOrmEntity;

  @Column({ name: 'token_hash', type: 'varchar' })
  tokenHash!: string;

  @Column({ type: 'varchar' })
  purpose!: 'refresh' | 'password_reset';

  @Column({ name: 'device_token', type: 'varchar', nullable: true })
  deviceToken!: string | null;

  @CreateDateColumn({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'replaced_by', type: 'uuid', nullable: true })
  replacedBy!: string | null;

  @ManyToOne(() => AuthTokenTypeOrmEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'replaced_by' })
  replacedByToken?: AuthTokenTypeOrmEntity | null;
}
