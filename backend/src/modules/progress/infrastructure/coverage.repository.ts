import { Injectable } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { ICoverageRepository } from '../domain/coverage.repository.interface';
import { MemorizationCoverageTypeOrmEntity } from './memorization-coverage.typeorm-entity';
import { CoverageIntervalTypeOrmEntity } from './coverage-interval.typeorm-entity';
import { HizbBoundaryTypeOrmEntity } from './hizb-boundary.typeorm-entity';

@Injectable()
export class CoverageRepository implements ICoverageRepository {
  async seedFromHizbSelection(
    membershipId: string,
    hizbNumbers: number[],
    manager: EntityManager,
  ): Promise<void> {
    const coverageId = uuidv7();

    const coverageEntity = manager.create(MemorizationCoverageTypeOrmEntity, {
      id: coverageId,
      membershipId,
      ahzabCompleted: hizbNumbers.length,
      lastMemorizedOrdinal: null,
    });

    await manager.save(MemorizationCoverageTypeOrmEntity, coverageEntity);

    if (hizbNumbers.length > 0) {
      const boundaries = await manager.find(HizbBoundaryTypeOrmEntity, {
        where: { hizbNumber: In(hizbNumbers) },
        order: { hizbNumber: 'ASC' },
      });

      const intervalEntities = boundaries.map((b) =>
        manager.create(CoverageIntervalTypeOrmEntity, {
          id: uuidv7(),
          coverageId,
          startOrdinal: b.startOrdinal,
          endOrdinal: b.endOrdinal,
        }),
      );

      await manager.save(CoverageIntervalTypeOrmEntity, intervalEntities);
    }
  }
}
