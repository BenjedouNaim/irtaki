import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ISurahRepository,
  SurahRecord,
} from '../domain/surah.repository.interface';
import { SurahTypeOrmEntity } from './surah.typeorm-entity';

@Injectable()
export class SurahRepository implements ISurahRepository {
  constructor(
    @InjectRepository(SurahTypeOrmEntity)
    private readonly repo: Repository<SurahTypeOrmEntity>,
  ) {}

  async findAll(): Promise<SurahRecord[]> {
    const rows = await this.repo.find({
      order: { number: 'ASC' },
    });

    return rows.map((row) => ({
      number: row.number,
      nameAr: row.nameAr,
      ayahCount: row.ayahCount,
      ordinalOffset: row.ordinalOffset,
    }));
  }
}
