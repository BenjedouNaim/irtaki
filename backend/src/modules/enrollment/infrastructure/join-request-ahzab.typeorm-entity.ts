import { Entity, PrimaryColumn } from 'typeorm';

@Entity('join_request_ahzab')
export class JoinRequestAhzabTypeOrmEntity {
  @PrimaryColumn({ name: 'join_request_id', type: 'uuid' })
  joinRequestId!: string;

  @PrimaryColumn({ name: 'hizb_number', type: 'smallint' })
  hizbNumber!: number;
}
