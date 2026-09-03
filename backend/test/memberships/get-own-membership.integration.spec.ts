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
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

describe('GET /memberships/mine (F-MEM-01 / API-025 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-own-membership.com';
  const testGroupPrefix = 'F-MEM-01 test group';
  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  };

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

  async function registerAndLogin(
    role: UserRole,
  ): Promise<{ accessToken: string; userId: string }> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const password = 'Password123!';
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

    return {
      accessToken: login.body.access_token as string,
      userId,
    };
  }

  async function createGroup(options?: {
    enrollmentStatus?: 'Open' | 'Closed';
    recitationDay?: number;
  }): Promise<{ id: string; name: string }> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    const id = uuidv7();
    const name = `${testGroupPrefix} ${uuidv7()}`;

    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', $3, $4, 'Active', $5, $6, $5, now(), now())`,
      [
        id,
        name,
        options?.recitationDay ?? 4,
        options?.enrollmentStatus ?? 'Closed',
        teacher.userId,
        assistant.userId,
      ],
    );

    return { id, name };
  }

  async function createMembership(options: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
    startedAt: string;
    endedAt?: string;
  }): Promise<string> {
    const id = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [
        id,
        options.userId,
        options.groupId,
        options.state,
        options.startedAt,
        options.endedAt ?? null,
      ],
    );
    return id;
  }

  it('returns only the Student own active membership with embedded group detail', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const formerGroup = await createGroup();
    const activeGroup = await createGroup({
      enrollmentStatus: 'Closed',
      recitationDay: 6,
    });
    const terminatedMembershipId = await createMembership({
      userId: student.userId,
      groupId: formerGroup.id,
      state: 'Terminated',
      startedAt: '2026-01-01',
      endedAt: '2026-02-01',
    });
    const activeMembershipId = await createMembership({
      userId: student.userId,
      groupId: activeGroup.id,
      state: 'Active',
      startedAt: '2026-08-01',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/memberships/mine')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.OK);

    expect(response.body).toEqual({
      data: {
        id: activeMembershipId,
        group: {
          id: activeGroup.id,
          name: activeGroup.name,
          recitation_day: 6,
          enrollment_status: 'Closed',
        },
        started_at: '2026-08-01',
        state: 'Active',
      },
    });
    expect(JSON.stringify(response.body)).not.toContain(terminatedMembershipId);
  });

  it('returns 404 NOT_FOUND when only a terminated membership exists', async () => {
    const student = await registerAndLogin(UserRole.Student);
    const group = await createGroup();
    await createMembership({
      userId: student.userId,
      groupId: group.id,
      state: 'Terminated',
      startedAt: '2026-01-01',
      endedAt: '2026-02-01',
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/memberships/mine')
      .set('Authorization', `Bearer ${student.accessToken}`)
      .expect(HttpStatus.NOT_FOUND);

    expect(response.body.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error).toBe('NOT_FOUND');
    expect(response.body).not.toHaveProperty('data');
  });

  it.each([UserRole.User, UserRole.Teacher, UserRole.Assistant])(
    'returns 403 for the %s role',
    async (role) => {
      const actor = await registerAndLogin(role);

      const response = await request(app.getHttpServer())
        .get('/api/v1/memberships/mine')
        .set('Authorization', `Bearer ${actor.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(response.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(response.body.error).toBe('SCOPE_DENIED');
    },
  );
});
