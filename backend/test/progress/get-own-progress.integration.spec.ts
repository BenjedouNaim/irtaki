/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication } from '@nestjs/common';
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
import {
  IPasswordHasher,
  PASSWORD_HASHER,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';

interface HizbRow {
  hizb_number: number;
  start_ordinal: number;
  end_ordinal: number;
  end_surah: number;
  end_ayah: number;
}

interface TestActor {
  accessToken: string;
  userId: string;
}

describe('GET /me/progress (F-PRG-02 / API-041 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-get-own-progress.com';
  const testGroupPrefix = 'F-PRG-02 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

  let hizb: Map<number, HizbRow>;
  let totalAyahs: number;

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

    dataSource = app.get(DataSource);
    await cleanDatabase();

    const rows: HizbRow[] = await dataSource.query(
      'SELECT hizb_number, start_ordinal, end_ordinal, end_surah, end_ayah FROM hizb_boundaries ORDER BY hizb_number',
    );
    hizb = new Map(
      rows.map((r) => [
        Number(r.hizb_number),
        {
          hizb_number: Number(r.hizb_number),
          start_ordinal: Number(r.start_ordinal),
          end_ordinal: Number(r.end_ordinal),
          end_surah: Number(r.end_surah),
          end_ayah: Number(r.end_ayah),
        },
      ]),
    );
    const totals: Array<{ total: string }> = await dataSource.query(
      'SELECT SUM(ayah_count) AS total FROM surahs',
    );
    totalAyahs = Number(totals[0].total);
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

  async function registerAndLogin(role: UserRole): Promise<TestActor> {
    const password = 'Password123!';

    // If role is Admin, respect DB-UQ-08 (single admin system-wide)
    if (role === UserRole.Admin) {
      const existingAdmins: Array<{ id: string; email: string }> =
        await dataSource.query(
          "SELECT id, email FROM users WHERE role = 'Admin' LIMIT 1",
        );

      if (existingAdmins.length > 0) {
        const adminId = existingAdmins[0].id;
        const adminEmail = existingAdmins[0].email;
        const passwordHasher = app.get<IPasswordHasher>(PASSWORD_HASHER);
        const hash = await passwordHasher.hash(password);
        await dataSource.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [hash, adminId],
        );

        const loginRes = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: adminEmail, password })
          .expect(HttpStatus.OK);

        return {
          accessToken: loginRes.body.access_token as string,
          userId: adminId,
        };
      }
    }

    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const userId = registration.body.id as string;
    await dataSource.query(
      'UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4',
      [role, `${role} test user`, 'Male', userId],
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    return { accessToken: login.body.access_token as string, userId };
  }

  async function createGroup(): Promise<string> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', 'Active', $3, $4, $3, now(), now())`,
      [id, `${testGroupPrefix} ${uuidv7()}`, teacher.userId, assistant.userId],
    );
    return id;
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '2026-08-01', $5, now(), now())`,
      [
        id,
        options.userId,
        options.groupId,
        options.state,
        options.state === 'Terminated' ? '2026-08-20' : null,
      ],
    );
    return id;
  }

  async function createCoverage(options: {
    membershipId: string;
    ahzabCompleted: number;
    lastMemorizedOrdinal: number | null;
    intervals: Array<{ start: number; end: number }>;
    deleted?: boolean;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memorization_coverage (
         id, membership_id, ahzab_completed, last_memorized_ordinal,
         created_at, updated_at, deleted_at
       ) VALUES ($1, $2, $3, $4, now(), now(), $5)`,
      [
        id,
        options.membershipId,
        options.ahzabCompleted,
        options.lastMemorizedOrdinal,
        options.deleted ? new Date() : null,
      ],
    );
    for (const i of options.intervals) {
      await dataSource.query(
        `INSERT INTO coverage_intervals (id, coverage_id, start_ordinal, end_ordinal)
         VALUES ($1, $2, $3, $4)`,
        [uuidv7(), id, i.start, i.end],
      );
    }
    return id;
  }

  it('returns the caller own coverage with the DEC-D02 flag always present and true', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup();
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      state: 'Active',
    });
    const h1 = hizb.get(1)!;
    const h60 = hizb.get(60)!;
    // Seeded with hizb 1 and 60 (skip-and-resume shape); last worked at the
    // end of hizb 1.
    await createCoverage({
      membershipId,
      ahzabCompleted: 2,
      lastMemorizedOrdinal: h1.end_ordinal,
      intervals: [
        { start: h1.start_ordinal, end: h1.end_ordinal },
        { start: h60.start_ordinal, end: h60.end_ordinal },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    const covered =
      h1.end_ordinal -
      h1.start_ordinal +
      1 +
      (h60.end_ordinal - h60.start_ordinal + 1);
    // SAS §17.6 formula, unrounded.
    const expectedPercent = (covered / totalAyahs) * 100;

    expect(response.body).toEqual({
      data: {
        ahzab_completed: 2,
        coverage_percent: expectedPercent,
        last_memorized_position: {
          surah: h1.end_surah,
          ayah: h1.end_ayah,
          ordinal: h1.end_ordinal,
        },
        is_activity_pointer_only: true,
      },
    });
    // The raw interval set is never exposed (APIS §11).
    expect(JSON.stringify(response.body)).not.toContain('intervals');
  });

  it('returns a null activity pointer and zero figures for an empty seed', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const groupId = await createGroup();
    const membershipId = await createMembership({
      userId: student.userId,
      groupId,
      state: 'Active',
    });
    await createCoverage({
      membershipId,
      ahzabCompleted: 0,
      lastMemorizedOrdinal: null,
      intervals: [],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: {
        ahzab_completed: 0,
        coverage_percent: 0,
        last_memorized_position: null,
        is_activity_pointer_only: true,
      },
    });
  });

  it('reads only the active membership coverage, ignoring a terminated one', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const formerGroup = await createGroup();
    const activeGroup = await createGroup();
    const terminatedMembershipId = await createMembership({
      userId: student.userId,
      groupId: formerGroup,
      state: 'Terminated',
    });
    await createCoverage({
      membershipId: terminatedMembershipId,
      ahzabCompleted: 59,
      lastMemorizedOrdinal: 7,
      intervals: [{ start: 1, end: 7 }],
      deleted: true,
    });
    const activeMembershipId = await createMembership({
      userId: student.userId,
      groupId: activeGroup,
      state: 'Active',
    });
    await createCoverage({
      membershipId: activeMembershipId,
      ahzabCompleted: 0,
      lastMemorizedOrdinal: null,
      intervals: [],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.body.data.ahzab_completed).toBe(0);
    expect(response.body.data.last_memorized_position).toBeNull();
  });

  it('returns 404 NOT_FOUND for a Student with no active membership', async () => {
    const student = await registerAndLogin(UserRole.Student);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.NOT_FOUND);

    expect(response.body.error).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('data');
  });

  it('returns 401 without a token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .expect(HttpStatus.UNAUTHORIZED);
  });

  it.each([
    UserRole.User,
    UserRole.Teacher,
    UserRole.Assistant,
    UserRole.Admin,
  ])('returns 403 SCOPE_DENIED for the %s role', async (role) => {
    const actor = await registerAndLogin(role);

    const response = await request(app.getHttpServer())
      .get('/api/v1/me/progress')
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(HttpStatus.FORBIDDEN);

    expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(response.body.error).toBe('SCOPE_DENIED');
  });
});
