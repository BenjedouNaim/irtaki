/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { DailyReportAyahPosition } from '../../src/modules/reports/domain/events/daily-report-submitted.event';
import { CoverageUpdatedEvent } from '../../src/modules/progress/domain/events/coverage-updated.event';
import {
  UpdateCoverageOutcome,
  UpdateCoverageUseCase,
} from '../../src/modules/progress/application/update-coverage/update-coverage.use-case';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface IntervalRow {
  start_ordinal: number;
  end_ordinal: number;
}

interface CoverageRow {
  ahzab_completed: number;
  last_memorized_ordinal: number | null;
}

interface HizbRow {
  hizb_number: number;
  start_ordinal: number;
  end_ordinal: number;
}

interface SurahRow {
  number: number;
  ayah_count: number;
  ordinal_offset: number;
}

describe('DS-05 coverage engine (F-PRG-01 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let eventEmitter: EventEmitter2;
  let updateCoverageUseCase: UpdateCoverageUseCase;

  const testEmailDomain = '@test-update-coverage.com';
  const testGroupPrefix = 'F-PRG-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  let hizb: Map<number, HizbRow>;
  let surahs: SurahRow[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MAILER)
      .useValue(mockMailer)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    // ADR-024's crons are live inside a booted AppModule; every suite
    // drives the jobs it cares about with its own clock instead.
    stopScheduledJobs(app);

    dataSource = app.get(DataSource);
    eventEmitter = app.get(EventEmitter2);
    updateCoverageUseCase = app.get(UpdateCoverageUseCase);
    await cleanDatabase();

    const rows: HizbRow[] = await dataSource.query(
      'SELECT hizb_number, start_ordinal, end_ordinal FROM hizb_boundaries ORDER BY hizb_number',
    );
    hizb = new Map(rows.map((r) => [Number(r.hizb_number), r]));

    const surahRows: SurahRow[] = await dataSource.query(
      'SELECT number, ayah_count, ordinal_offset FROM surahs ORDER BY number',
    );
    surahs = surahRows.map((s) => ({
      number: Number(s.number),
      ayah_count: Number(s.ayah_count),
      ordinal_offset: Number(s.ordinal_offset),
    }));
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase(): Promise<void> {
    await dataSource.query(
      `DELETE FROM memorization_coverage
       WHERE membership_id IN (
         SELECT id FROM memberships
         WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
       )`,
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      `DELETE FROM memberships
       WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
          OR group_id IN (SELECT id FROM groups WHERE name LIKE $2)`,
      [`%${testEmailDomain}`, `${testGroupPrefix}%`],
    );
    await dataSource.query(
      `DELETE FROM groups
       WHERE name LIKE $1
          OR teacher_id IN (SELECT id FROM users WHERE email LIKE $2)
          OR assistant_id IN (SELECT id FROM users WHERE email LIKE $2)
          OR created_by IN (SELECT id FROM users WHERE email LIKE $2)`,
      [`${testGroupPrefix}%`, `%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query(
      'DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)',
      [`%${testEmailDomain}`],
    );
    await dataSource.query('DELETE FROM users WHERE email LIKE $1', [
      `%${testEmailDomain}`,
    ]);
  }

  async function registerUser(role: UserRole): Promise<string> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);
    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} test user`, 'Male', userId],
    );
    return userId;
  }

  async function seedMembershipWithCoverage(options: {
    intervals: IntervalRow[];
    ahzabCompleted: number;
    state?: 'Active' | 'Terminated';
    softDeleteCoverage?: boolean;
  }): Promise<{ membershipId: string; coverageId: string }> {
    const teacherId = await registerUser(UserRole.Teacher);
    const assistantId = await registerUser(UserRole.Assistant);
    const studentId = await registerUser(UserRole.Student);

    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', 'Active', $3, $4, $3, now(), now())`,
      [groupId, `${testGroupPrefix} ${uuidv7()}`, teacherId, assistantId],
    );

    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '2026-08-01', $5, now(), now())`,
      [
        membershipId,
        studentId,
        groupId,
        options.state ?? 'Active',
        options.state === 'Terminated' ? '2026-08-20' : null,
      ],
    );

    const coverageId = uuidv7();
    await dataSource.query(
      `INSERT INTO memorization_coverage (
         id, membership_id, ahzab_completed, last_memorized_ordinal,
         created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, NULL, now(), now(), $4)`,
      [
        coverageId,
        membershipId,
        options.ahzabCompleted,
        options.softDeleteCoverage ? new Date() : null,
      ],
    );
    for (const interval of options.intervals) {
      await dataSource.query(
        `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
         VALUES ($1, $2, $3, $4)`,
        [uuidv7(), coverageId, interval.start_ordinal, interval.end_ordinal],
      );
    }

    return { membershipId, coverageId };
  }

  async function readCoverage(coverageId: string): Promise<{
    row: CoverageRow;
    intervals: IntervalRow[];
  }> {
    const rows: CoverageRow[] = await dataSource.query(
      'SELECT ahzab_completed, last_memorized_ordinal FROM memorization_coverage WHERE id = $1',
      [coverageId],
    );
    const intervals: IntervalRow[] = await dataSource.query(
      'SELECT start_ordinal, end_ordinal FROM coverage_intervals WHERE coverage_id = $1 ORDER BY start_ordinal',
      [coverageId],
    );
    return {
      row: {
        ahzab_completed: Number(rows[0].ahzab_completed),
        last_memorized_ordinal:
          rows[0].last_memorized_ordinal == null
            ? null
            : Number(rows[0].last_memorized_ordinal),
      },
      intervals: intervals.map((i) => ({
        start_ordinal: Number(i.start_ordinal),
        end_ordinal: Number(i.end_ordinal),
      })),
    };
  }

  /** VO-01 shape for an ordinal, resolved against the real `surahs` table. */
  function position(ordinal: number): DailyReportAyahPosition {
    const surah = surahs.find(
      (s) =>
        ordinal > s.ordinal_offset &&
        ordinal <= s.ordinal_offset + s.ayah_count,
    )!;
    return {
      surah: surah.number,
      ayah: ordinal - surah.ordinal_offset,
      ordinal,
    };
  }

  async function executeCoverageUpdate(
    membershipId: string,
    memoRange: { fromOrdinal: number; toOrdinal: number } | null,
  ): Promise<UpdateCoverageOutcome> {
    return updateCoverageUseCase.execute({
      membershipId,
      memoRange: memoRange
        ? {
            start: position(memoRange.fromOrdinal),
            end: position(memoRange.toOrdinal),
          }
        : null,
    });
  }

  it('is directly and synchronously callable, returning updated ahzab_completed for API-030', async () => {
    const h1 = hizb.get(1)!;
    const h2 = hizb.get(2)!;
    const { membershipId } = await seedMembershipWithCoverage({
      intervals: [
        { start_ordinal: h1.start_ordinal, end_ordinal: h1.end_ordinal },
      ],
      ahzabCompleted: 1,
    });

    const outcome = await executeCoverageUpdate(membershipId, {
      fromOrdinal: h2.start_ordinal,
      toOrdinal: h2.end_ordinal,
    });

    expect(outcome).toMatchObject({
      status: 'updated',
      membershipId,
      ahzabCompleted: 2,
      lastMemorizedOrdinal: Number(h2.end_ordinal),
    });
  });

  it('merges an adjacent range into the seeded hizb and recomputes ahzab_completed against the real dataset', async () => {
    const h1 = hizb.get(1)!;
    const h2 = hizb.get(2)!;
    const { membershipId, coverageId } = await seedMembershipWithCoverage({
      intervals: [
        { start_ordinal: h1.start_ordinal, end_ordinal: h1.end_ordinal },
      ],
      ahzabCompleted: 1,
    });

    const received: CoverageUpdatedEvent[] = [];
    const onUpdated = (e: CoverageUpdatedEvent) => {
      received.push(e);
    };
    eventEmitter.on(CoverageUpdatedEvent.EVENT_NAME, onUpdated);

    try {
      await executeCoverageUpdate(membershipId, {
        fromOrdinal: h2.start_ordinal,
        toOrdinal: h2.end_ordinal,
      });
    } finally {
      eventEmitter.off(CoverageUpdatedEvent.EVENT_NAME, onUpdated);
    }

    const { row, intervals } = await readCoverage(coverageId);
    expect(intervals).toEqual([
      { start_ordinal: h1.start_ordinal, end_ordinal: h2.end_ordinal },
    ]);
    expect(row.ahzab_completed).toBe(2);
    expect(row.last_memorized_ordinal).toBe(Number(h2.end_ordinal));

    expect(received).toHaveLength(1);
    expect(received[0].membershipId).toBe(membershipId);
    expect(received[0].ahzabCompleted).toBe(2);
  });

  it('skip-and-resume produces a second disjoint interval and never shrinks coverage (INV-18)', async () => {
    const h60 = hizb.get(60)!;
    const { membershipId, coverageId } = await seedMembershipWithCoverage({
      intervals: [
        { start_ordinal: h60.start_ordinal, end_ordinal: h60.end_ordinal },
      ],
      ahzabCompleted: 1,
    });

    // Backward step from the very start of the mushaf, then a partial hizb.
    await executeCoverageUpdate(membershipId, {
      fromOrdinal: 1,
      toOrdinal: 20,
    });
    await executeCoverageUpdate(membershipId, {
      fromOrdinal: 10,
      toOrdinal: 30,
    });

    const { row, intervals } = await readCoverage(coverageId);
    expect(intervals).toEqual([
      { start_ordinal: 1, end_ordinal: 30 },
      { start_ordinal: h60.start_ordinal, end_ordinal: h60.end_ordinal },
    ]);
    // Hizb 60 remains complete; hizb 1 is only partially covered.
    expect(row.ahzab_completed).toBe(1);
    expect(row.last_memorized_ordinal).toBe(30);
  });

  it('is a no-op for reports without a memorisation range', async () => {
    const h5 = hizb.get(5)!;
    const { membershipId, coverageId } = await seedMembershipWithCoverage({
      intervals: [
        { start_ordinal: h5.start_ordinal, end_ordinal: h5.end_ordinal },
      ],
      ahzabCompleted: 1,
    });

    await executeCoverageUpdate(membershipId, null);
    await executeCoverageUpdate(membershipId, null);

    const { row, intervals } = await readCoverage(coverageId);
    expect(intervals).toEqual([
      { start_ordinal: h5.start_ordinal, end_ordinal: h5.end_ordinal },
    ]);
    expect(row.ahzab_completed).toBe(1);
    expect(row.last_memorized_ordinal).toBeNull();
  });

  it('leaves a soft-deleted (terminated) coverage row untouched and does not throw', async () => {
    const { membershipId, coverageId } = await seedMembershipWithCoverage({
      intervals: [{ start_ordinal: 1, end_ordinal: 7 }],
      ahzabCompleted: 0,
      state: 'Terminated',
      softDeleteCoverage: true,
    });

    const outcome = await executeCoverageUpdate(membershipId, {
      fromOrdinal: 8,
      toOrdinal: 20,
    });
    expect(outcome).toEqual({
      status: 'skipped',
      reason: 'COVERAGE_NOT_FOUND',
    });

    const { row, intervals } = await readCoverage(coverageId);
    expect(intervals).toEqual([{ start_ordinal: 1, end_ordinal: 7 }]);
    expect(row.ahzab_completed).toBe(0);
  });

  it('serializes concurrent coverage merges via optimistic concurrency retries without losing data', async () => {
    const h1 = hizb.get(1)!;
    const h2 = hizb.get(2)!;
    const h3 = hizb.get(3)!;
    const { membershipId, coverageId } = await seedMembershipWithCoverage({
      intervals: [
        { start_ordinal: h1.start_ordinal, end_ordinal: h1.end_ordinal },
      ],
      ahzabCompleted: 1,
    });

    // Fire two merges nearly simultaneously for the same membership
    const [res1, res2] = await Promise.all([
      executeCoverageUpdate(membershipId, {
        fromOrdinal: h2.start_ordinal,
        toOrdinal: h2.end_ordinal,
      }),
      executeCoverageUpdate(membershipId, {
        fromOrdinal: h3.start_ordinal,
        toOrdinal: h3.end_ordinal,
      }),
    ]);

    expect(res1.status).toBe('updated');
    expect(res2.status).toBe('updated');

    const { row, intervals } = await readCoverage(coverageId);
    // Both hizb 2 and hizb 3 merged successfully into hizb 1
    expect(intervals).toEqual([
      { start_ordinal: h1.start_ordinal, end_ordinal: h3.end_ordinal },
    ]);
    expect(row.ahzab_completed).toBe(3);
  });
});
