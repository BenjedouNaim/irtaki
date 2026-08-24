import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('coverage_intervals')
export class CoverageIntervalTypeOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'coverage_id', type: 'uuid' })
  coverageId!: string;

  @Column({ name: 'start_ordinal', type: 'integer' })
  startOrdinal!: number;

  @Column({ name: 'end_ordinal', type: 'integer' })
  endOrdinal!: number;
}
