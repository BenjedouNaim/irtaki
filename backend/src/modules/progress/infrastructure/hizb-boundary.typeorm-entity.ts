import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('hizb_boundaries')
export class HizbBoundaryTypeOrmEntity {
  @PrimaryColumn({ name: 'hizb_number', type: 'smallint' })
  hizbNumber!: number;

  @Column({ name: 'start_ordinal', type: 'integer' })
  startOrdinal!: number;

  @Column({ name: 'end_ordinal', type: 'integer' })
  endOrdinal!: number;

  @Column({ name: 'start_surah', type: 'smallint' })
  startSurah!: number;

  @Column({ name: 'start_ayah', type: 'smallint' })
  startAyah!: number;

  @Column({ name: 'end_surah', type: 'smallint' })
  endSurah!: number;

  @Column({ name: 'end_ayah', type: 'smallint' })
  endAyah!: number;
}
