import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  HizbBoundaryRecord,
  IHizbBoundaryRepository,
} from '../domain/hizb-boundary.repository.interface';
import { HizbBoundaryTypeOrmEntity } from './hizb-boundary.typeorm-entity';

@Injectable()
export class HizbBoundaryRepository implements IHizbBoundaryRepository {
  constructor(
    @InjectRepository(HizbBoundaryTypeOrmEntity)
    private readonly repo: Repository<HizbBoundaryTypeOrmEntity>,
  ) {}

  async findAll(): Promise<HizbBoundaryRecord[]> {
    const rows = await this.repo.find({
      order: { hizbNumber: 'ASC' },
    });

    return rows.map((row) => ({
      hizbNumber: row.hizbNumber,
      startSurah: row.startSurah,
      startAyah: row.startAyah,
      endSurah: row.endSurah,
      endAyah: row.endAyah,
    }));
  }
}
