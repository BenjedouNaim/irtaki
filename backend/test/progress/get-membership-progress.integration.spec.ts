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
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

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

interface Fixture {
  teacher: TestActor;
  assistant: TestActor;
  student: TestActor;
  groupId: string;
  membershipId: string;
}

describe('GET /memberships/{id}/progress (F-PRG-03 / API-042 Integration)', () => {
  jest.setTimeout(60000);

  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-get-membership-progress.com';
  const testGroupPrefix = 'F-PRG-03 test group';
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

    // ADR-024's crons are live inside a booted AppModule; every suite
    // drives the jobs it cares about with its own clock instead.
    stopScheduledJobs(app);

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
    await purgeNotificationLog(dataSource);
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
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const password = 'Password123!';

    // Reuse the single Admin row via the password-reset trick (house pattern,
    // DB-UQ-08: exactly one Admin system-wide).
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

  async function createCoverage(options: {
    membershipId: string;
    ahzabCompleted: number;
    lastMemorizedOrdinal: number | null;
    intervals: Array<{ start: number; end: number }>;
    deleted?: boolean;
  }): Promise<void> {
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
  }

  /**
   * One group with its own Teacher/Assistant and one enrolled Student whose
   * coverage is hizb 1 + hizb 2 (adjacent, merged into one interval), last
   * worked at the end of hizb 2.
   */
  async function seedFixture(options?: {
    state?: 'Active' | 'Terminated';
    coverageDeleted?: boolean;
  }): Promise<Fixture> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const student = await registerAndLogin(UserRole.Student);

    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', 'Active', $3, $4, $3, now(), now())`,
      [
        groupId,
        `${testGroupPrefix} ${uuidv7()}`,
        teacher.userId,
        assistant.userId,
      ],
    );

    const state = options?.state ?? 'Active';
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, '2026-08-01', $5, now(), now())`,
      [
        membershipId,
        student.userId,
        groupId,
        state,
        state === 'Terminated' ? '2026-08-20' : null,
      ],
    );

    const h1 = hizb.get(1)!;
    const h2 = hizb.get(2)!;
    await createCoverage({
      membershipId,
      ahzabCompleted: 2,
      lastMemorizedOrdinal: h2.end_ordinal,
      intervals: [{ start: h1.start_ordinal, end: h2.end_ordinal }],
      deleted: options?.coverageDeleted ?? false,
    });

    return { teacher, assistant, student, groupId, membershipId };
  }

  function expectedPayload(): Record<string, unknown> {
    const h1 = hizb.get(1)!;
    const h2 = hizb.get(2)!;
    const covered = h2.end_ordinal - h1.start_ordinal + 1;
    return {
      data: {
        ahzab_completed: 2,
        // SAS §17.6 formula, unrounded.
        coverage_percent: (covered / totalAyahs) * 100,
        last_memorized_position: {
          surah: h2.end_surah,
          ayah: h2.end_ayah,
          ordinal: h2.end_ordinal,
        },
        is_activity_pointer_only: true,
      },
    };
  }

  describe('in-scope access', () => {
    it('returns the student coverage for the Teacher of the membership group (same shape as API-041)', async () => {
      const fx = await seedFixture();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${fx.teacher.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(expectedPayload());
      expect(JSON.stringify(response.body)).not.toContain('intervals');
    });

    it('returns the student coverage for the Admin (all groups)', async () => {
      const fx = await seedFixture();
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toEqual(expectedPayload());
    });
  });

  describe('scope denial (NFR-20 uniform 403)', () => {
    it('returns 403 SCOPE_DENIED for a Teacher of a different group', async () => {
      const target = await seedFixture();
      const other = await seedFixture();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${target.membershipId}/progress`)
        .set('Authorization', `Bearer ${other.teacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
      expect(response.body).not.toHaveProperty('data');
    });

    it('returns the same 403 for a Teacher on a non-existent membership', async () => {
      const fx = await seedFixture();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${uuidv7()}/progress`)
        .set('Authorization', `Bearer ${fx.teacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 404 NOT_FOUND for a Teacher on a malformed id (APIS §9.6)', async () => {
      const fx = await seedFixture();

      const response = await request(app.getHttpServer())
        .get('/api/v1/memberships/not-a-uuid/progress')
        .set('Authorization', `Bearer ${fx.teacher.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });
  });

  describe('Admin requests (DEC-C07 scope bypass with 404 for missing/malformed resources)', () => {
    it('returns 404 NOT_FOUND for a non-existent membership (APIS §6.1 / §9.6)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${uuidv7()}/progress`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body).not.toHaveProperty('data');
    });

    it('returns 404 NOT_FOUND for a malformed id (APIS §9.6)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await request(app.getHttpServer())
        .get('/api/v1/memberships/not-a-uuid/progress')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND for a terminated membership whose coverage is soft-deleted', async () => {
      const fx = await seedFixture({
        state: 'Terminated',
        coverageDeleted: true,
      });
      const admin = await registerAndLogin(UserRole.Admin);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('returns uniform 403 SCOPE_DENIED to the Teacher of that terminated membership group', async () => {
      const fx = await seedFixture({
        state: 'Terminated',
        coverageDeleted: true,
      });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${fx.teacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe('role denial (RolesGuard, DEC-B09)', () => {
    it('returns 403 for the Assistant of the very same group', async () => {
      const fx = await seedFixture();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${fx.assistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 403 for the Student on their own membership (API-042 is staff-only)', async () => {
      const fx = await seedFixture();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${fx.student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 403 for a plain User', async () => {
      const fx = await seedFixture();
      const user = await registerAndLogin(UserRole.User);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/memberships/${fx.membershipId}/progress`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/memberships/${uuidv7()}/progress`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });
});
