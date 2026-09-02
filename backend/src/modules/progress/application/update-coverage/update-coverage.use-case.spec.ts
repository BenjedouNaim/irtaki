/* eslint-disable @typescript-eslint/unbound-method */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import { DailyReportSubmittedEvent } from '../../../reports/domain/events/daily-report-submitted.event';
import {
  CoverageRecord,
  ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import { CoverageUpdatedEvent } from '../../domain/events/coverage-updated.event';
import {
  HizbBoundaryRecord,
  IHizbBoundaryRepository,
} from '../../domain/hizb-boundary.repository.interface';
import { UpdateCoverageUseCase } from './update-coverage.use-case';

describe('UpdateCoverageUseCase (DS-05 application wiring)', () => {
  let useCase: UpdateCoverageUseCase;
  let coverageRepository: jest.Mocked<ICoverageRepository>;
  let hizbBoundaryRepository: jest.Mocked<IHizbBoundaryRepository>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  const manager = {} as EntityManager;

  const membershipId = 'membership-1';

  const hizbBoundaries: HizbBoundaryRecord[] = [
    {
      hizbNumber: 1,
      startOrdinal: 1,
      endOrdinal: 100,
      startSurah: 1,
      startAyah: 1,
      endSurah: 2,
      endAyah: 93,
    },
    {
      hizbNumber: 2,
      startOrdinal: 101,
      endOrdinal: 200,
      startSurah: 2,
      startAyah: 94,
      endSurah: 2,
      endAyah: 193,
    },
  ];

  const seededRecord: CoverageRecord = {
    id: 'coverage-1',
    membershipId,
    ahzabCompleted: 1,
    lastMemorizedOrdinal: null,
    intervals: [{ startOrdinal: 1, endOrdinal: 100 }],
  };

  function event(
    memoRange: { fromOrdinal: number; toOrdinal: number } | null,
    type: 'Normal' | 'Absent' | 'Revision' = 'Normal',
  ): DailyReportSubmittedEvent {
    return new DailyReportSubmittedEvent(
      membershipId,
      '2026-09-02',
      type,
      memoRange,
    );
  }

  beforeEach(() => {
    coverageRepository = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn(),
      applyMerge: jest.fn(),
    };
    hizbBoundaryRepository = {
      findAll: jest.fn().mockResolvedValue(hizbBoundaries),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager),
      ),
    } as unknown as jest.Mocked<Pick<DataSource, 'transaction'>>;
    eventEmitter = { emit: jest.fn() };

    useCase = new UpdateCoverageUseCase(
      coverageRepository,
      hizbBoundaryRepository,
      dataSource as unknown as DataSource,
      eventEmitter as unknown as EventEmitter2,
    );
  });

  it('is a no-op when the report carries no memorisation range', async () => {
    const outcome = await useCase.execute(event(null, 'Absent'));

    expect(outcome).toEqual({ status: 'skipped', reason: 'NO_MEMO_RANGE' });
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(coverageRepository.applyMerge).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('merges the range inside one transaction, persists the derived figures and emits DE-06', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);

    const outcome = await useCase.execute(
      event({ fromOrdinal: 101, toOrdinal: 200 }),
    );

    expect(coverageRepository.findByMembershipId).toHaveBeenCalledWith(
      membershipId,
      manager,
    );
    expect(coverageRepository.applyMerge).toHaveBeenCalledWith(
      'coverage-1',
      {
        merged: { startOrdinal: 1, endOrdinal: 200 },
        ahzabCompleted: 2,
        lastMemorizedOrdinal: 200,
      },
      manager,
    );
    expect(outcome).toEqual({
      status: 'updated',
      membershipId,
      ahzabCompleted: 2,
      lastMemorizedOrdinal: 200,
      intervals: [{ startOrdinal: 1, endOrdinal: 200 }],
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      CoverageUpdatedEvent.EVENT_NAME,
      new CoverageUpdatedEvent(
        membershipId,
        [{ startOrdinal: 1, endOrdinal: 200 }],
        2,
      ),
    );
  });

  it('never shrinks coverage: a re-memorised sub-range keeps the existing block (INV-18)', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);

    const outcome = await useCase.execute(
      event({ fromOrdinal: 10, toOrdinal: 20 }),
    );

    expect(coverageRepository.applyMerge).toHaveBeenCalledWith(
      'coverage-1',
      {
        merged: { startOrdinal: 1, endOrdinal: 100 },
        ahzabCompleted: 1,
        lastMemorizedOrdinal: 20,
      },
      manager,
    );
    expect(outcome).toMatchObject({
      status: 'updated',
      intervals: [{ startOrdinal: 1, endOrdinal: 100 }],
    });
  });

  it('skips without writing when the membership has no live coverage row', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(null);

    const outcome = await useCase.execute(
      event({ fromOrdinal: 1, toOrdinal: 10 }),
    );

    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'COVERAGE_NOT_FOUND',
    });
    expect(coverageRepository.applyMerge).not.toHaveBeenCalled();
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('does not emit DE-06 when the transaction fails', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);
    coverageRepository.applyMerge.mockRejectedValue(new Error('db down'));

    await expect(
      useCase.execute(event({ fromOrdinal: 1, toOrdinal: 10 })),
    ).rejects.toThrow('db down');
    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });

  it('still returns the outcome if DE-06 emission throws', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);
    eventEmitter.emit.mockImplementation(() => {
      throw new Error('emitter broken');
    });

    const outcome = await useCase.execute(
      event({ fromOrdinal: 101, toOrdinal: 150 }),
    );

    expect(outcome).toMatchObject({ status: 'updated', ahzabCompleted: 1 });
  });
});
