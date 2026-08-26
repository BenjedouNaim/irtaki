/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
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
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';

interface TestActor {
  accessToken: string;
  userId: string;
}

describe('GET /groups/:id/memberships (F-MEM-02 / API-026 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testEmailDomain = '@test-roster.com';
  const testGroupPrefix = 'F-MEM-02 test group';

  // Fixed dates for deterministic window assertions
  const STARTED = '2026-01-01';
  const ENDED = '2026-03-01';
  const AS_OF = '2026-02-15';

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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
    );
    app.setGlobalPrefix('api/v1');

    await app.init();
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
    options?: { fullName?: string | null; gender?: 'Male' | 'Female' | null },
  ): Promise<TestActor> {
    const email = `${role.toLowerCase()}-${uuidv7()}${testEmailDomain}`;
    const password = 'Password123!';

    // Reuse a single Admin row via the password-reset trick (house pattern)
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
      [
        role,
        options?.fullName ?? `${role} test user`,
        options?.gender ?? 'Male',
        userId,
      ],
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

  async function seedStaff(): Promise<{
    teacher: TestActor;
    assistant: TestActor;
  }> {
    const teacher = await registerAndLogin(UserRole.Teacher);
    const assistant = await registerAndLogin(UserRole.Assistant);
    return { teacher, assistant };
  }

  async function seedGroup(params: {
    teacherId: string;
    assistantId: string;
    createdBy: string;
  }): Promise<string> {
    const groupId = uuidv7();
    await dataSource.query(
      `INSERT INTO groups (
         id, name, gender, recitation_day, enrollment_status,
         lifecycle_state, teacher_id, assistant_id, created_by,
         created_at, updated_at
       ) VALUES ($1, $2, 'Male', 4, 'Closed', 'Active', $3, $4, $5, now(), now())`,
      [
        groupId,
        `${testGroupPrefix} ${uuidv7()}`,
        params.teacherId,
        params.assistantId,
        params.createdBy,
      ],
    );
    return groupId;
  }

  async function seedMembership(params: {
    userId: string;
    groupId: string;
    state: 'Active' | 'Terminated';
    startedAt: string;
    endedAt?: string | null;
  }): Promise<string> {
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (
         id, user_id, group_id, state, started_at, ended_at, ended_by,
         created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL, now(), now())`,
      [
        membershipId,
        params.userId,
        params.groupId,
        params.state,
        params.startedAt,
        params.endedAt ?? null,
      ],
    );
    return membershipId;
  }

  describe('Admin scope', () => {
    it('returns the current roster with the exact API-026 envelope; terminated member absent without ?as_of', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const activeStudent = await registerAndLogin(UserRole.Student);
      const terminatedStudent = await registerAndLogin(UserRole.Student);
      const terminatedMembershipId = await seedMembership({
        userId: terminatedStudent.userId,
        groupId,
        state: 'Terminated',
        startedAt: STARTED,
        endedAt: ENDED,
      });
      const activeMembershipId = await seedMembership({
        userId: activeStudent.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: [
          {
            id: activeMembershipId,
            user: {
              id: activeStudent.userId,
              full_name: 'Student test user',
              gender: 'Male',
            },
            started_at: STARTED,
            state: 'Active',
          },
        ],
      });
      expect(JSON.stringify(res.body)).not.toContain(terminatedMembershipId);
    });

    it('with ?as_of includes memberships whose window covers as_of on a closed interval', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const coveredStudent = await registerAndLogin(UserRole.Student);
      const boundaryStudent = await registerAndLogin(UserRole.Student);
      const dayBeforeStudent = await registerAndLogin(UserRole.Student);
      const startedAfterStudent = await registerAndLogin(UserRole.Student);

      const coveredId = await seedMembership({
        userId: coveredStudent.userId,
        groupId,
        state: 'Terminated',
        startedAt: STARTED,
        endedAt: ENDED, // [2026-01-01, 2026-03-01] covers as_of
      });
      const boundaryId = await seedMembership({
        userId: boundaryStudent.userId,
        groupId,
        state: 'Terminated',
        startedAt: STARTED,
        endedAt: AS_OF, // ended exactly on as_of -> included (closed interval)
      });
      const dayBeforeId = await seedMembership({
        userId: dayBeforeStudent.userId,
        groupId,
        state: 'Terminated',
        startedAt: STARTED,
        endedAt: '2026-02-14', // day before as_of -> excluded
      });
      const startedAfterId = await seedMembership({
        userId: startedAfterStudent.userId,
        groupId,
        state: 'Active',
        startedAt: '2026-02-16', // started after as_of -> excluded
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships?as_of=${AS_OF}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const entries = res.body.data as Array<{
        id: string;
        started_at: string;
        state: string;
      }>;
      const ids = entries.map((e) => e.id);

      expect(ids).toContain(coveredId);
      expect(ids).toContain(boundaryId);
      expect(ids).not.toContain(dayBeforeId);
      expect(ids).not.toContain(startedAfterId);

      const covered = entries.find((e) => e.id === coveredId);
      expect(covered).toMatchObject({
        started_at: STARTED,
        state: 'Terminated',
      });
    });

    it('orders entries by full_name ASC', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const belal = await registerAndLogin(UserRole.Student, {
        fullName: 'Belal Test',
      });
      const ahmed = await registerAndLogin(UserRole.Student, {
        fullName: 'Ahmed Test',
      });
      const amine = await registerAndLogin(UserRole.Student, {
        fullName: 'Amine Test',
      });

      await seedMembership({
        userId: belal.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });
      await seedMembership({
        userId: ahmed.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });
      await seedMembership({
        userId: amine.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const names = (
        res.body.data as Array<{ user: { full_name: string } }>
      ).map((e) => e.user.full_name);
      expect(names).toEqual(['Ahmed Test', 'Amine Test', 'Belal Test']);
    });

    it('returns 403 SCOPE_DENIED for a nonexistent group id (uniform-403 precedent)', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const nonexistentId = uuidv7();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${nonexistentId}/memberships`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toBe('SCOPE_DENIED');
    });

    it('returns 422 VALIDATION_ERROR when as_of is not a YYYY-MM-DD date', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships?as_of=not-a-date`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Teacher scope', () => {
    it('returns 200 with the current roster for the assigned Teacher', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships`)
        .set('Authorization', `Bearer ${staff.teacher.accessToken}`)
        .expect(HttpStatus.OK);

      const ids = (res.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(ids).toContain(membershipId);
    });

    it('returns historical terminated rows for the assigned Teacher when ?as_of is supplied', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const staff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: staff.teacher.userId,
        assistantId: staff.assistant.userId,
        createdBy: admin.userId,
      });

      const activeStudent = await registerAndLogin(UserRole.Student);
      const terminatedStudent = await registerAndLogin(UserRole.Student);
      const terminatedId = await seedMembership({
        userId: terminatedStudent.userId,
        groupId,
        state: 'Terminated',
        startedAt: STARTED,
        endedAt: ENDED,
      });
      await seedMembership({
        userId: activeStudent.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships?as_of=${AS_OF}`)
        .set('Authorization', `Bearer ${staff.teacher.accessToken}`)
        .expect(HttpStatus.OK);

      const ids = (res.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(ids).toContain(terminatedId);
    });

    it('returns 403 SCOPE_DENIED for a group the Teacher is not assigned to', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const otherStaff = await seedStaff();
      const outsiderTeacher = await registerAndLogin(UserRole.Teacher);
      const otherGroupId = await seedGroup({
        teacherId: otherStaff.teacher.userId,
        assistantId: otherStaff.assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${otherGroupId}/memberships`)
        .set('Authorization', `Bearer ${outsiderTeacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe('Assistant scope', () => {
    it('returns 200 with the current roster for the assigned Assistant', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const assignedAssistant = await registerAndLogin(UserRole.Assistant);
      const otherStaff = await seedStaff();
      const groupId = await seedGroup({
        teacherId: otherStaff.teacher.userId,
        assistantId: assignedAssistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(UserRole.Student);
      const membershipId = await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
        startedAt: STARTED,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}/memberships`)
        .set('Authorization', `Bearer ${assignedAssistant.accessToken}`)
        .expect(HttpStatus.OK);

      const ids = (res.body.data as Array<{ id: string }>).map((e) => e.id);
      expect(ids).toContain(membershipId);
    });

    it('returns 403 SCOPE_DENIED for a group the Assistant is not assigned to', async () => {
      const admin = await registerAndLogin(UserRole.Admin);
      const otherStaff = await seedStaff();
      const outsiderAssistant = await registerAndLogin(UserRole.Assistant);
      const otherGroupId = await seedGroup({
        teacherId: otherStaff.teacher.userId,
        assistantId: otherStaff.assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${otherGroupId}/memberships`)
        .set('Authorization', `Bearer ${outsiderAssistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(res.body.error).toBe('SCOPE_DENIED');
    });
  });

  describe.each([UserRole.Student, UserRole.User])(
    '%s role rejection',
    (role) => {
      it('returns 403 SCOPE_DENIED (RolesGuard)', async () => {
        const admin = await registerAndLogin(UserRole.Admin);
        const staff = await seedStaff();
        const groupId = await seedGroup({
          teacherId: staff.teacher.userId,
          assistantId: staff.assistant.userId,
          createdBy: admin.userId,
        });

        const actor = await registerAndLogin(role);

        const res = await request(app.getHttpServer())
          .get(`/api/v1/groups/${groupId}/memberships`)
          .set('Authorization', `Bearer ${actor.accessToken}`)
          .expect(HttpStatus.FORBIDDEN);

        expect(res.body.statusCode).toBe(HttpStatus.FORBIDDEN);
        expect(res.body.error).toBe('SCOPE_DENIED');
      });
    },
  );
});
