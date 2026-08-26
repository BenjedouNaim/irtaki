import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('surahs')
export class SurahTypeOrmEntity {
  @PrimaryColumn({ name: 'number', type: 'smallint' })
  number!: number;

  @Column({ name: 'name_ar', type: 'varchar' })
  nameAr!: string;

  @Column({ name: 'ayah_count', type: 'smallint' })
  ayahCount!: number;

  @Column({ name: 'ordinal_offset', type: 'integer' })
  ordinalOffset!: number;
}
