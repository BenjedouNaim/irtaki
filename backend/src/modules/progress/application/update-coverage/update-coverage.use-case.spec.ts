/* eslint-disable @typescript-eslint/unbound-method */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, EntityManager } from 'typeorm';
import {
  DailyReportAyahPosition,
  DailyReportSubmittedEvent,
} from '../../../reports/domain/events/daily-report-submitted.event';
import { AyahPosition } from '../../domain/ayah-position';
import { AyahRange } from '../../domain/ayah-range';
import {
  CoverageRecord,
  ICoverageRepository,
} from '../../domain/coverage.repository.interface';
import {
  CoverageConcurrencyConflictError,
  InvalidCoverageIntervalError,
} from '../../domain/coverage.errors';
import { CoverageUpdatedEvent } from '../../domain/events/coverage-updated.event';
import {
  HizbBoundaryRecord,
  IHizbBoundaryRepository,
} from '../../domain/hizb-boundary.repository.interface';
import {
  ISurahRepository,
  SurahRecord,
} from '../../domain/surah.repository.interface';
import { UpdateCoverageUseCase } from './update-coverage.use-case';

describe('UpdateCoverageUseCase (DS-05 application wiring)', () => {
  let useCase: UpdateCoverageUseCase;
  let coverageRepository: jest.Mocked<ICoverageRepository>;
  let hizbBoundaryRepository: jest.Mocked<IHizbBoundaryRepository>;
  let surahRepository: jest.Mocked<ISurahRepository>;
  let dataSource: jest.Mocked<Pick<DataSource, 'transaction'>>;
  let eventEmitter: jest.Mocked<Pick<EventEmitter2, 'emit'>>;
  const manager = {} as EntityManager;

  const membershipId = 'membership-1';

  // Synthetic reference data: T = 1000 ayat across two surahs.
  const surahs: SurahRecord[] = [
    { number: 1, nameAr: 'أ', ayahCount: 100, ordinalOffset: 0 },
    { number: 2, nameAr: 'ب', ayahCount: 900, ordinalOffset: 100 },
  ];

  const pos = (ordinal: number): DailyReportAyahPosition => {
    const p = AyahPosition.fromOrdinal(ordinal, surahs);
    return { surah: p.surah, ayah: p.ayah, ordinal: p.ordinal };
  };
  const r = (lo: number, hi: number): AyahRange =>
    AyahRange.fromOrdinals(lo, hi, surahs);

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

  const testUpdatedAt = new Date('2026-09-01T12:00:00Z');

  const seededRecord: CoverageRecord = {
    id: 'coverage-1',
    membershipId,
    ahzabCompleted: 1,
    lastMemorizedOrdinal: null,
    updatedAt: testUpdatedAt,
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
      memoRange
        ? { start: pos(memoRange.fromOrdinal), end: pos(memoRange.toOrdinal) }
        : null,
    );
  }

  beforeEach(() => {
    coverageRepository = {
      seedFromHizbSelection: jest.fn(),
      findByMembershipId: jest.fn(),
      findActiveByUserId: jest.fn(),
      findByMembershipIdForStaff: jest.fn(),
      applyMerge: jest.fn(),
    };
    hizbBoundaryRepository = {
      findAll: jest.fn().mockResolvedValue(hizbBoundaries),
    };
    surahRepository = {
      findAll: jest.fn().mockResolvedValue(surahs),
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
      surahRepository,
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
        expectedUpdatedAt: testUpdatedAt,
      },
      manager,
    );
    expect(outcome).toEqual({
      status: 'updated',
      membershipId,
      ahzabCompleted: 2,
      lastMemorizedOrdinal: 200,
      intervals: [r(1, 200)],
    });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      CoverageUpdatedEvent.EVENT_NAME,
      new CoverageUpdatedEvent(membershipId, [r(1, 200)], 2),
    );
  });

  it('supports direct invocation inside an external manager without opening a second transaction', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);
    const customManager = {} as EntityManager;

    const outcome = await useCase.execute(
      {
        membershipId,
        memoRange: {
          start: { surah: 2, ayah: 1 },
          end: { surah: 2, ayah: 100 },
        },
      },
      customManager,
    );

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(coverageRepository.findByMembershipId).toHaveBeenCalledWith(
      membershipId,
      customManager,
    );
    expect(coverageRepository.applyMerge).toHaveBeenCalledWith(
      'coverage-1',
      expect.objectContaining({
        expectedUpdatedAt: testUpdatedAt,
      }),
      customManager,
    );
    expect(outcome.status).toBe('updated');
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
        expectedUpdatedAt: testUpdatedAt,
      },
      manager,
    );
    expect(outcome).toMatchObject({
      status: 'updated',
      intervals: [r(1, 100)],
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

  it('rejects a range whose end precedes its start before touching the database (BR-52)', async () => {
    await expect(
      useCase.execute(event({ fromOrdinal: 20, toOrdinal: 10 })),
    ).rejects.toThrow(InvalidCoverageIntervalError);
    expect(dataSource.transaction).not.toHaveBeenCalled();
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

  it('retries when CoverageConcurrencyConflictError is encountered on optimistic concurrency mismatch', async () => {
    coverageRepository.findByMembershipId.mockResolvedValue(seededRecord);
    coverageRepository.applyMerge
      .mockRejectedValueOnce(new CoverageConcurrencyConflictError('conflict'))
      .mockResolvedValueOnce(undefined);

    const outcome = await useCase.execute(
      event({ fromOrdinal: 101, toOrdinal: 200 }),
    );

    expect(outcome.status).toBe('updated');
    expect(coverageRepository.applyMerge).toHaveBeenCalledTimes(2);
  });
});
