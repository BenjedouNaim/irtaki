import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  IMailer,
  MAILER,
} from '../../src/modules/identity/domain/mailer.interface';
import { CoverageReconciliationJob } from '../../src/modules/progress/infrastructure/jobs/coverage-reconciliation.job';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface CoverageRow {
  id: string;
  ahzab_completed: number;
  last_memorized_ordinal: number | null;
}

interface IntervalRow {
  start_ordinal: number;
  end_ordinal: number;
}

/**
 * `CoverageReconciliationJob` (ADR-029, SA §19 "Nightly, global", §23
 * Required) against real Postgres.
 *
 * The drift it repairs is manufactured exactly as production produces it:
 * a `daily_reports` row commits (transaction one) and the
 * `memorization_coverage` update that ADR-026 dispatches post-commit
 * (transaction two) never lands.
 */
describe('CoverageReconciliationJob (ADR-029) Integration', () => {
  jest.setTimeout(120000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let job: CoverageReconciliationJob;

  const testEmailDomain = '@test-coverage-reconciliation.com';
  const testGroupPrefix = 'ADR-029 reconciliation group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  let staffId: string;

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
    job = app.get(CoverageReconciliationJob);

    await cleanDatabase();
    staffId = await createUser('Teacher');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase(): Promise<void> {
    const mine = `(SELECT id FROM users WHERE email LIKE $1)`;
    const params = [`%${testEmailDomain}`];
    for (const statement of [
      `DELETE FROM coverage_intervals WHERE coverage_id IN (SELECT id FROM memorization_coverage WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine}))`,
      `DELETE FROM memorization_coverage WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM daily_reports WHERE membership_id IN (SELECT id FROM memberships WHERE user_id IN ${mine})`,
      `DELETE FROM memberships WHERE user_id IN ${mine}`,
      `DELETE FROM groups WHERE name LIKE '${testGroupPrefix}%' AND $1::text IS NOT NULL`,
      `DELETE FROM users WHERE email LIKE $1`,
    ]) {
      await dataSource.query(statement, params);
    }
  }

  async function createUser(role: string): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, gender, timezone)
       VALUES ($1, $2, 'not-a-login-in-this-suite', $3, 'Fixture', 'Male', 'Africa/Tunis')`,
      [id, `${role.toLowerCase()}-${id}${testEmailDomain}`, role],
    );
    return id;
  }

  async function ordinalOf(surah: number, ayah: number): Promise<number> {
    const rows: Array<{ ordinal_offset: number | string }> =
      await dataSource.query(
        'SELECT ordinal_offset FROM surahs WHERE number = $1',
        [surah],
      );
    return Number(rows[0].ordinal_offset) + ayah;
  }

  /** A membership whose coverage row exists but holds no intervals yet. */
  async function createMembershipWithCoverage(): Promise<{
    membershipId: string;
    coverageId: string;
  }> {
    const userId = await createUser('Student');
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by
       ) VALUES ($1, $2, 'Male', 5, 'Closed', 'Active', $3, $3, $3)`,
      [groupId, `${testGroupPrefix} ${uuidv7()}`, staffId],
    );
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at)
       VALUES ($1, $2, $3, 'Active', '2026-06-01'::date)`,
      [membershipId, userId, groupId],
    );
    const coverageId = uuidv7();
    await dataSource.query(
      `INSERT INTO memorization_coverage (id, membership_id, ahzab_completed, last_memorized_ordinal)
       VALUES ($1, $2, 0, NULL)`,
      [coverageId, membershipId],
    );
    return { membershipId, coverageId };
  }

  async function submitReportWithRange(
    membershipId: string,
    reportDate: string,
    fromOrdinal: number,
    toOrdinal: number,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO daily_reports (
         id, membership_id, report_date, type, submitted_timezone,
         no_memorization_today, memo_from_ordinal, memo_to_ordinal,
         no_revision_today
       ) VALUES ($1, $2, $3::date, 'Normal', 'Africa/Tunis', false, $4, $5, true)`,
      [uuidv7(), membershipId, reportDate, fromOrdinal, toOrdinal],
    );
  }

  async function addInterval(
    coverageId: string,
    startOrdinal: number,
    endOrdinal: number,
  ): Promise<void> {
    await dataSource.query(
      `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
       VALUES ($1, $2, $3, $4)`,
      [uuidv7(), coverageId, startOrdinal, endOrdinal],
    );
  }

  async function coverageOf(coverageId: string): Promise<CoverageRow> {
    const rows = await dataSource.query<CoverageRow[]>(
      `SELECT id, ahzab_completed, last_memorized_ordinal
         FROM memorization_coverage WHERE id = $1`,
      [coverageId],
    );
    return rows[0];
  }

  async function intervalsOf(coverageId: string): Promise<IntervalRow[]> {
    return dataSource.query<IntervalRow[]>(
      `SELECT start_ordinal, end_ordinal
         FROM coverage_intervals
        WHERE coverage_id = $1
        ORDER BY start_ordinal`,
      [coverageId],
    );
  }

  it('repairs coverage a failed post-commit update left behind', async () => {
    const { membershipId, coverageId } = await createMembershipWithCoverage();
    const from = await ordinalOf(114, 1); // An-Nas 1
    const to = await ordinalOf(114, 6); // An-Nas 6
    // The report committed; DS-05's second transaction did not.
    await submitReportWithRange(membershipId, '2026-09-01', from, to);

    expect(await intervalsOf(coverageId)).toEqual([]);

    const outcome = await job.run();

    expect(outcome).not.toBeNull();
    expect(outcome!.drifted).toBeGreaterThanOrEqual(1);
    expect(await intervalsOf(coverageId)).toEqual([
      { start_ordinal: from, end_ordinal: to },
    ]);
    const coverage = await coverageOf(coverageId);
    expect(Number(coverage.last_memorized_ordinal)).toBe(to);
  });

  it('is idempotent — a second run finds nothing to correct', async () => {
    const { membershipId, coverageId } = await createMembershipWithCoverage();
    const from = await ordinalOf(113, 1);
    const to = await ordinalOf(113, 5);
    await submitReportWithRange(membershipId, '2026-09-01', from, to);

    await job.run();
    const afterFirstIntervals = await intervalsOf(coverageId);
    const afterFirstCoverage = await coverageOf(coverageId);

    await job.run();

    expect(await intervalsOf(coverageId)).toEqual(afterFirstIntervals);
    expect(await coverageOf(coverageId)).toEqual(afterFirstCoverage);
  });

  it('merges a lost range into the interval it is adjacent to (VO-07)', async () => {
    const { membershipId, coverageId } = await createMembershipWithCoverage();
    const first = await ordinalOf(114, 1);
    const mid = await ordinalOf(114, 3);
    const last = await ordinalOf(114, 6);
    // The first report's coverage landed; the second report's did not.
    await addInterval(coverageId, first, mid);
    await submitReportWithRange(membershipId, '2026-09-01', first, mid);
    await submitReportWithRange(membershipId, '2026-09-02', mid + 1, last);

    await job.run();

    expect(await intervalsOf(coverageId)).toEqual([
      { start_ordinal: first, end_ordinal: last },
    ]);
  });

  it('never discards the DS-01 acceptance seed no report accounts for', async () => {
    const { coverageId } = await createMembershipWithCoverage();
    const from = await ordinalOf(112, 1);
    const to = await ordinalOf(112, 4);
    // Seeded coverage with no daily report behind it at all (F-ENR-05).
    await addInterval(coverageId, from, to);

    await job.run();

    expect(await intervalsOf(coverageId)).toEqual([
      { start_ordinal: from, end_ordinal: to },
    ]);
  });

  it('leaves a membership whose coverage already matches its reports alone', async () => {
    const { membershipId, coverageId } = await createMembershipWithCoverage();
    const from = await ordinalOf(111, 1);
    const to = await ordinalOf(111, 5);
    await addInterval(coverageId, from, to);
    await submitReportWithRange(membershipId, '2026-09-01', from, to);
    await dataSource.query(
      `UPDATE memorization_coverage SET last_memorized_ordinal = $2 WHERE id = $1`,
      [coverageId, to],
    );
    const before = await coverageOf(coverageId);

    await job.run();

    expect(await coverageOf(coverageId)).toEqual(before);
    expect(await intervalsOf(coverageId)).toEqual([
      { start_ordinal: from, end_ordinal: to },
    ]);
  });
});
