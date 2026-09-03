/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
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
import { WeeklyReportFinalizationService } from '../../src/modules/reports/application/finalise-weekly-reports/weekly-report-finalization.service';
import { WeeklyReportFinalisedEvent } from '../../src/modules/reports/domain/events/weekly-report-finalised.event';
import {
  WEEKLY_REPORT_FINALIZATION_CRON,
  WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION,
  WeeklyReportFinalizationJob,
} from '../../src/modules/reports/infrastructure/jobs/weekly-report-finalization.job';

/** Independent UTC date arithmetic on a YYYY-MM-DD value. */
function shift(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type WeeklyReportRow = {
  id: string;
  attended_recitation_call: boolean;
  state: string;
  finalised_at: string | null;
  finalised_by: string | null;
  missed_daily_reports: number;
};

describe('WeeklyReportFinalizationService / Job (F-WR-02, DS-02, FR-WR-06 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;
  let service: WeeklyReportFinalizationService;
  let job: WeeklyReportFinalizationJob;
  let eventEmitter: EventEmitter2;

  const testEmailDomain = '@test-weekly-finalization.com';
  const testGroupPrefix = 'F-WR-02 job test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  // The fixture week: recitation day Friday 2026-09-04. Instants below are
  // chosen around student-local midnight of that day.
  const weekEnd = '2026-09-04';
  const weekStart = shift(weekEnd, -6);
  /** 23:59 Tunis (UTC+1) on the recitation day. */
  const tunisBeforeMidnight = new Date('2026-09-04T22:59:00.000Z');
  /** 00:01 Tunis on the following day. */
  const tunisAfterMidnight = new Date('2026-09-04T23:01:00.000Z');

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

    // The real tick is stopped: every run below is driven with a controlled
    // clock through the service/job entry points.
    await app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON)
      .stop();

    dataSource = app.get(DataSource);
    service = app.get(WeeklyReportFinalizationService);
    job = app.get(WeeklyReportFinalizationJob);
    eventEmitter = app.get(EventEmitter2);
    await cleanDatabase();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanDatabase();
    }
    await app.close();
  });

  async function cleanDatabase(): Promise<void> {
    await dataSource.query(
      `DELETE FROM weekly_reports
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

  async function registerUser(
    role: UserRole,
    timezone: string,
  ): Promise<string> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!', timezone })
      .expect(HttpStatus.CREATED);
    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} test user`, 'Male', userId],
    );
    return userId;
  }

  /** A Student (in `timezone`) enrolled in a fresh Friday-recitation group. */
  async function enrolStudent(
    timezone: string,
  ): Promise<{ userId: string; membershipId: string }> {
    const userId = await registerUser(UserRole.Student, timezone);
    const teacherId = await registerUser(UserRole.Teacher, 'Africa/Tunis');
    const assistantId = await registerUser(UserRole.Assistant, 'Africa/Tunis');
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, archived_at, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 5, 'Closed', 'Active', NULL, $3, $4, $3, now(), now())`,
      [groupId, `${testGroupPrefix} ${uuidv7()}`, teacherId, assistantId],
    );
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, 'Active', $4::date, NULL, now(), now())`,
      [membershipId, userId, groupId, shift(weekStart, -30)],
    );
    return { userId, membershipId };
  }

  async function insertOpenRow(
    membershipId: string,
    end: string = weekEnd,
    deleted = false,
  ): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO weekly_reports (
         id, membership_id, week_start, week_end, expected_days,
         missed_daily_reports, missed_daily_memorization, missed_daily_revision,
         missed_50_repetitions, missed_single_session, deleted_at
       ) VALUES ($1, $2, $3::date, $4::date, 6, 3, 3, 3, 0, 0, $5)`,
      [id, membershipId, shift(end, -6), end, deleted ? new Date() : null],
    );
    return id;
  }

  async function rowById(id: string): Promise<WeeklyReportRow> {
    const rows: WeeklyReportRow[] = await dataSource.query(
      `SELECT id, attended_recitation_call, state, finalised_at, finalised_by,
              missed_daily_reports
         FROM weekly_reports WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  it('leaves an Open row alone until student-local midnight, then defaults it with attended = false and finalised_by NULL (AC-12)', async () => {
    const student = await enrolStudent('Africa/Tunis');
    const id = await insertOpenRow(student.membershipId);

    const received: WeeklyReportFinalisedEvent[] = [];
    const listener = (event: WeeklyReportFinalisedEvent) => {
      if (event.membershipId === student.membershipId) {
        received.push(event);
      }
    };
    eventEmitter.on(WeeklyReportFinalisedEvent.EVENT_NAME, listener);

    const before = await service.finaliseOverdue(tunisBeforeMidnight);
    expect(before.finalised).toBe(0);
    expect(await rowById(id)).toMatchObject({
      state: 'Open',
      finalised_at: null,
    });
    expect(received).toHaveLength(0);

    const after = await service.finaliseOverdue(tunisAfterMidnight);
    eventEmitter.off(WeeklyReportFinalisedEvent.EVENT_NAME, listener);

    expect(after.finalised).toBeGreaterThanOrEqual(1);
    const row = await rowById(id);
    expect(row).toMatchObject({
      attended_recitation_call: false,
      state: 'Finalised',
      finalised_by: null,
      // Metrics untouched — snapshot is the row as created.
      missed_daily_reports: 3,
    });
    expect(new Date(row.finalised_at as string).toISOString()).toBe(
      tunisAfterMidnight.toISOString(),
    );

    // DE-07 with finalised_by = null (Scheduler path).
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(
      expect.objectContaining({
        membershipId: student.membershipId,
        week: { weekStart, weekEnd },
        attended: false,
        finalisedBy: null,
      }),
    );
  });

  it('is idempotent: a second run rewrites nothing and emits nothing (VR-36, AR-17, EC-40)', async () => {
    const student = await enrolStudent('Africa/Tunis');
    const id = await insertOpenRow(student.membershipId);
    await service.finaliseOverdue(tunisAfterMidnight);
    const first = await rowById(id);

    const received: WeeklyReportFinalisedEvent[] = [];
    const listener = (event: WeeklyReportFinalisedEvent) => {
      if (event.membershipId === student.membershipId) {
        received.push(event);
      }
    };
    eventEmitter.on(WeeklyReportFinalisedEvent.EVENT_NAME, listener);
    await service.finaliseOverdue(
      new Date(tunisAfterMidnight.getTime() + 15 * 60 * 1000),
    );
    eventEmitter.off(WeeklyReportFinalisedEvent.EVENT_NAME, listener);

    expect(await rowById(id)).toEqual(first);
    expect(received).toHaveLength(0);
  });

  it('evaluates midnight per student timezone for one and the same instant (T-01, ADR-030, two-timezone fixture)', async () => {
    // 23:30 UTC on the 4th: 00:30 on the 5th in Tunis, 16:30 on the 4th in
    // Los Angeles.
    const instant = new Date('2026-09-04T23:30:00.000Z');
    const tunis = await enrolStudent('Africa/Tunis');
    const losAngeles = await enrolStudent('America/Los_Angeles');
    const tunisRow = await insertOpenRow(tunis.membershipId);
    const laRow = await insertOpenRow(losAngeles.membershipId);

    await service.finaliseOverdue(instant);

    expect((await rowById(tunisRow)).state).toBe('Finalised');
    expect((await rowById(laRow)).state).toBe('Open');

    // 08:00 UTC on the 5th: 01:00 on the 5th in Los Angeles — now overdue.
    await service.finaliseOverdue(new Date('2026-09-05T08:00:00.000Z'));
    expect(await rowById(laRow)).toMatchObject({
      state: 'Finalised',
      attended_recitation_call: false,
      finalised_by: null,
    });
  });

  it('catches up an overdue row on a later run after a missed tick (EC-39, SAS §19.6)', async () => {
    const student = await enrolStudent('Africa/Tunis');
    const id = await insertOpenRow(student.membershipId, shift(weekEnd, -14));

    await service.finaliseOverdue(new Date('2026-09-20T12:00:00.000Z'));

    expect(await rowById(id)).toMatchObject({
      state: 'Finalised',
      attended_recitation_call: false,
      finalised_by: null,
    });
  });

  it('never touches a Student-finalised row, a soft-deleted row, or a row whose day has not come', async () => {
    const student = await enrolStudent('Africa/Tunis');
    const confirmedId = await insertOpenRow(student.membershipId);
    await dataSource.query(
      `UPDATE weekly_reports
          SET attended_recitation_call = true, state = 'Finalised',
              finalised_at = $2::timestamptz, finalised_by = $3
        WHERE id = $1`,
      [confirmedId, tunisBeforeMidnight.toISOString(), student.userId],
    );
    const confirmed = await rowById(confirmedId);
    const deletedId = await insertOpenRow(student.membershipId, weekEnd, true);
    const futureId = await insertOpenRow(
      student.membershipId,
      shift(weekEnd, 7),
    );

    await service.finaliseOverdue(tunisAfterMidnight);

    expect(await rowById(confirmedId)).toEqual(confirmed);
    expect(await rowById(deletedId)).toMatchObject({
      state: 'Open',
      finalised_at: null,
    });
    expect(await rowById(futureId)).toMatchObject({
      state: 'Open',
      finalised_at: null,
    });
  });

  it('the job wraps the service with a controlled clock, reports the outcome and is registered on the ADR-030 15-minute tick', async () => {
    const student = await enrolStudent('Africa/Tunis');
    const id = await insertOpenRow(student.membershipId);

    const outcome = await job.run(tunisAfterMidnight);

    expect(outcome).not.toBeNull();
    expect(outcome?.finalised).toBeGreaterThanOrEqual(1);
    expect((await rowById(id)).state).toBe('Finalised');

    const cron = app
      .get(SchedulerRegistry)
      .getCronJob(WEEKLY_REPORT_FINALIZATION_CRON);
    expect(cron).toBeDefined();
    expect(WEEKLY_REPORT_FINALIZATION_CRON_EXPRESSION).toBe('0 */15 * * * *');
  });
});
