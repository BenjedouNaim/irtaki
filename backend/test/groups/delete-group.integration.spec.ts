import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '../../src/app.module';
import {
  MAILER,
  IMailer,
} from '../../src/modules/identity/domain/mailer.interface';
import {
  PASSWORD_HASHER,
  IPasswordHasher,
} from '../../src/modules/identity/domain/password-hasher.interface';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { LoginResponseDto } from '../../src/modules/identity/application/login/login-response.dto';
import { UserRole } from '../../src/modules/identity/domain/user-role.enum';
import { GroupListItemDto } from '../../src/modules/groups/application/list-groups/group-list-item.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('DELETE /groups/:id (API-018 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

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

  async function cleanDatabase() {
    await dataSource.query(
      "DELETE FROM join_request_ahzab WHERE join_request_id IN (SELECT id FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com'))",
    );
    await dataSource.query(
      "DELETE FROM join_requests WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com'))",
    );
    await dataSource.query(
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com') OR name LIKE '%حلقة فحص الحذف%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-delete-group.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-delete-group.com'",
    );
  }

  async function registerAndLogin(
    email: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
    gender: 'Male' | 'Female' | null = null,
  ): Promise<{ accessToken: string; userId: string; userEmail: string }> {
    const password = 'Password123!';

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

        const loginBody = loginRes.body as LoginResponseDto;
        return {
          accessToken: loginBody.access_token,
          userId: adminId,
          userEmail: adminEmail,
        };
      }
    }

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const regBody = regRes.body as RegisterResponseDto;
    const userId = regBody.id;

    if (role !== UserRole.User || fullName !== null || gender !== null) {
      await dataSource.query(
        `UPDATE users SET role = $1, full_name = $2, gender = $3 WHERE id = $4`,
        [role, fullName, gender, userId],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    const loginBody = loginRes.body as LoginResponseDto;

    return {
      accessToken: loginBody.access_token,
      userId,
      userEmail: email,
    };
  }

  async function createTestGroup(
    adminToken: string,
    name: string,
    teacherId: string,
    assistantId: string,
    gender: 'Male' | 'Female' = 'Male',
    recitationDay = 3,
  ): Promise<GroupListItemDto> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name,
        gender,
        recitation_day: recitationDay,
        teacher_id: teacherId,
        assistant_id: assistantId,
      })
      .expect(HttpStatus.CREATED);

    return (res.body as { data: GroupListItemDto }).data;
  }

  describe('Valid Group Hard Delete by Admin', () => {
    it('deletes a group with no membership history (204) and removes it from the database', async () => {
      const admin = await registerAndLogin(
        'admin-del@test-delete-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-del-1@test-delete-group.com',
        UserRole.Teacher,
        'الشيخ حسان',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-del-1@test-delete-group.com',
        UserRole.Assistant,
        'الأستاذ كمال',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الحذف - حذف ناجح بدون سجل',
        teacher.userId,
        assistant.userId,
      );

      // Delete the group
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify row is gone from DB
      const rows: Array<{ id: string }> = await dataSource.query(
        'SELECT id FROM groups WHERE id = $1',
        [group.id],
      );
      expect(rows.length).toBe(0);
    });

    it('cleans up rejected join_requests in the same transaction and deletes group without FK restriction error', async () => {
      const admin = await registerAndLogin(
        'admin-del@test-delete-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-del-2@test-delete-group.com',
        UserRole.Teacher,
        'الشيخ منذر',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-del-2@test-delete-group.com',
        UserRole.Assistant,
        'الأستاذ سامي',
        'Male',
      );
      const applicant = await registerAndLogin(
        'applicant-del-1@test-delete-group.com',
        UserRole.User,
        'المتقدم سمير',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الحذف - طلب انضمام مرفوض',
        teacher.userId,
        assistant.userId,
      );

      // Seed a rejected join request for this group (with join_request_ahzab rows)
      const joinRequestId = uuidv7();
      await dataSource.query(
        `INSERT INTO join_requests (
           id, user_id, group_id, full_name, gender, age, phone_number, occupation, city,
           memorized_hizb_count, tajweed_level, studied_tajweed_theory, studied_qalun,
           fee_agreement, program_goal, score, status, reviewed_by, reviewed_at, created_at
         ) VALUES (
           $1, $2, $3, 'المتقدم سمير', 'Male', 25, '+21699111222', 'مهندس', 'تونس',
           10, 'Intermediate', true, true,
           true, 'Memorization', 75.50, 'Rejected', $4, NOW(), NOW()
         )`,
        [joinRequestId, applicant.userId, group.id, assistant.userId],
      );
      await dataSource.query(
        `INSERT INTO join_request_ahzab (join_request_id, hizb_number) VALUES ($1, 1), ($2, 2)`,
        [joinRequestId, joinRequestId],
      );

      // Delete the group
      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify both group and join_request are gone
      const groupRows: Array<{ id: string }> = await dataSource.query(
        'SELECT id FROM groups WHERE id = $1',
        [group.id],
      );
      expect(groupRows.length).toBe(0);

      const jrRows: Array<{ id: string }> = await dataSource.query(
        'SELECT id FROM join_requests WHERE id = $1',
        [joinRequestId],
      );
      expect(jrRows.length).toBe(0);
    });
  });

  describe('BR-43 / VR-30 Membership History Invariant', () => {
    it('returns 409 GROUP_HAS_HISTORY when group has an ended/Terminated membership', async () => {
      const admin = await registerAndLogin(
        'admin-del@test-delete-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-del-3@test-delete-group.com',
        UserRole.Teacher,
        'الشيخ بشير',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-del-3@test-delete-group.com',
        UserRole.Assistant,
        'الأستاذ وسيم',
        'Male',
      );
      const student = await registerAndLogin(
        'student-del-1@test-delete-group.com',
        UserRole.Student,
        'الطالب وليد',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الحذف - عضوية منتهية',
        teacher.userId,
        assistant.userId,
      );

      // Seed a Terminated membership row for this group (historical membership per BR-43)
      const membershipId = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, group_id, state, started_at, ended_at, ended_by, created_at, updated_at)
         VALUES ($1, $2, $3, 'Terminated', '2026-01-01', '2026-06-01', $4, NOW(), NOW())`,
        [membershipId, student.userId, group.id, admin.userId],
      );

      // Attempt to delete group -> 409 GROUP_HAS_HISTORY
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.CONFLICT);

      const resBody = res.body as { error?: string; message?: string };
      expect(resBody.error).toBe('GROUP_HAS_HISTORY');
      expect(resBody.message).toBe('لا يمكن حذف حلقة سبق أن انضم إليها طلاب');

      // Verify group row still exists
      const groupRows: Array<{ id: string }> = await dataSource.query(
        'SELECT id FROM groups WHERE id = $1',
        [group.id],
      );
      expect(groupRows.length).toBe(1);
    });

    it('returns 409 GROUP_HAS_HISTORY when group has an Active membership', async () => {
      const admin = await registerAndLogin(
        'admin-del@test-delete-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-del-4@test-delete-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-del-4@test-delete-group.com',
        UserRole.Assistant,
      );
      const student = await registerAndLogin(
        'student-del-2@test-delete-group.com',
        UserRole.Student,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الحذف - عضوية نشطة',
        teacher.userId,
        assistant.userId,
      );

      const membershipId = uuidv7();
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'Active', '2026-08-01', NOW(), NOW())`,
        [membershipId, student.userId, group.id],
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.CONFLICT);
    });
  });

  describe('Validation & Error Handling', () => {
    it('returns 404 GROUP_NOT_FOUND for non-existent UUID', async () => {
      const admin = await registerAndLogin(
        'admin-del@test-delete-group.com',
        UserRole.Admin,
      );
      const randomId = uuidv7();

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.NOT_FOUND);

      const resBody = res.body as { error?: string };
      expect(resBody.error).toBe('GROUP_NOT_FOUND');
    });
  });

  describe('Authorization Matrix (positive + negative per AGENTS.md §11)', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth-del@test-delete-group.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth-del@test-delete-group.com',
        UserRole.Assistant,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth-del@test-delete-group.com',
        UserRole.Student,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth-del@test-delete-group.com',
        UserRole.User,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .delete(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
