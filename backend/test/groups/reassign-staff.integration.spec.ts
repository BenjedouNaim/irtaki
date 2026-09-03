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

describe('PATCH /groups/:id/staff (API-016 Integration)', () => {
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
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com') OR name LIKE '%حلقة فحص إعادة تعيين الكادر%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-reassign-staff.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-reassign-staff.com'",
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

  // 1. Valid reassignment (Admin)
  describe('Valid staff reassignment by Admin', () => {
    it('successfully swaps both teacher and assistant and writes audit entry', async () => {
      const admin = await registerAndLogin(
        'admin-staff-1@test-reassign-staff.com',
        UserRole.Admin,
      );
      const initialTeacher = await registerAndLogin(
        'teacher-init-1@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الأولي',
      );
      const initialAssistant = await registerAndLogin(
        'assistant-init-1@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الأولي',
      );

      const newTeacher = await registerAndLogin(
        'teacher-new-1@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الجديد',
      );
      const newAssistant = await registerAndLogin(
        'assistant-new-1@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الجديد',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص إعادة تعيين الكادر - تبديل كلي',
        initialTeacher.userId,
        initialAssistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          teacher_id: newTeacher.userId,
          assistant_id: newAssistantIdOrUser(newAssistant.userId),
        })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.id).toBe(group.id);
      expect(body.data.teacher.id).toBe(newTeacher.userId);
      expect(body.data.assistant.id).toBe(newAssistant.userId);

      // Verify DB
      const dbRows: Array<{ teacher_id: string; assistant_id: string }> =
        await dataSource.query(
          'SELECT teacher_id, assistant_id FROM groups WHERE id = $1',
          [group.id],
        );
      expect(dbRows[0].teacher_id).toBe(newTeacher.userId);
      expect(dbRows[0].assistant_id).toBe(newAssistant.userId);

      // Verify Audit entry
      const auditRows: Array<{
        action: string;
        target_type: string;
        target_id: string;
        previous_value: Record<string, unknown>;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT action, target_type, target_id, previous_value, new_value FROM audit_entries WHERE actor_id = $1 AND action = 'STAFF_REASSIGNED' AND target_id = $2",
        [admin.userId, group.id],
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].previous_value).toEqual({
        teacher_id: initialTeacher.userId,
        assistant_id: initialAssistant.userId,
      });
      expect(auditRows[0].new_value).toEqual({
        teacher_id: newTeacher.userId,
        assistant_id: newAssistant.userId,
      });
    });

    it('successfully swaps only teacher (partial swap) and writes audit entry for teacher only', async () => {
      const admin = await registerAndLogin(
        'admin-staff-2@test-reassign-staff.com',
        UserRole.Admin,
      );
      const initialTeacher = await registerAndLogin(
        'teacher-init-2@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الأولي 2',
      );
      const initialAssistant = await registerAndLogin(
        'assistant-init-2@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الأولي 2',
      );
      const newTeacher = await registerAndLogin(
        'teacher-new-2@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الجديد 2',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص إعادة تعيين الكادر - معلم فقط',
        initialTeacher.userId,
        initialAssistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          teacher_id: newTeacher.userId,
        })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.teacher.id).toBe(newTeacher.userId);
      expect(body.data.assistant.id).toBe(initialAssistant.userId);

      // Verify Audit entry
      const auditRows: Array<{
        previous_value: Record<string, unknown>;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT previous_value, new_value FROM audit_entries WHERE actor_id = $1 AND action = 'STAFF_REASSIGNED' AND target_id = $2",
        [admin.userId, group.id],
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].previous_value).toEqual({
        teacher_id: initialTeacher.userId,
      });
      expect(auditRows[0].new_value).toEqual({
        teacher_id: newTeacher.userId,
      });
    });

    it('successfully swaps only assistant (partial swap) and writes audit entry for assistant only', async () => {
      const admin = await registerAndLogin(
        'admin-staff-3@test-reassign-staff.com',
        UserRole.Admin,
      );
      const initialTeacher = await registerAndLogin(
        'teacher-init-3@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الأولي 3',
      );
      const initialAssistant = await registerAndLogin(
        'assistant-init-3@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الأولي 3',
      );
      const newAssistant = await registerAndLogin(
        'assistant-new-3@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الجديد 3',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص إعادة تعيين الكادر - مساعد فقط',
        initialTeacher.userId,
        initialAssistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          assistant_id: newAssistant.userId,
        })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.teacher.id).toBe(initialTeacher.userId);
      expect(body.data.assistant.id).toBe(newAssistant.userId);

      // Verify Audit entry
      const auditRows: Array<{
        previous_value: Record<string, unknown>;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT previous_value, new_value FROM audit_entries WHERE actor_id = $1 AND action = 'STAFF_REASSIGNED' AND target_id = $2",
        [admin.userId, group.id],
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].previous_value).toEqual({
        assistant_id: initialAssistant.userId,
      });
      expect(auditRows[0].new_value).toEqual({
        assistant_id: newAssistant.userId,
      });
    });
  });

  // Helper function for typing
  function newAssistantIdOrUser(id: string) {
    return id;
  }

  // 2. Role mismatch VR-24 -> 422
  describe('Role mismatch (VR-24 Validation)', () => {
    it('returns 422 when provided teacher lacks Teacher role and assistant lacks Assistant role', async () => {
      const admin = await registerAndLogin(
        'admin-staff-vr@test-reassign-staff.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-vr@test-reassign-staff.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-vr@test-reassign-staff.com',
        UserRole.Assistant,
      );

      const studentUser = await registerAndLogin(
        'student-vr@test-reassign-staff.com',
        UserRole.Student,
      );
      const plainUser = await registerAndLogin(
        'plain-vr@test-reassign-staff.com',
        UserRole.User,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص إعادة تعيين الكادر - خطأ أدوار',
        teacher.userId,
        assistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          teacher_id: studentUser.userId,
          assistant_id: plainUser.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = res.body as {
        statusCode: number;
        error: string;
        details: Array<{ field: string; rule: string }>;
      };
      expect(body.statusCode).toBe(422);
      expect(body.error).toBe('VALIDATION_ERROR');
      expect(body.details).toHaveLength(2);
      expect(body.details.map((d) => d.field)).toEqual([
        'teacher_id',
        'assistant_id',
      ]);
    });
  });

  // 3. Same-user no-op -> 200
  describe('Same-user no-op', () => {
    it('returns 200 without modifying DB or creating audit row when reassigning to same users', async () => {
      const admin = await registerAndLogin(
        'admin-staff-noop@test-reassign-staff.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-noop@test-reassign-staff.com',
        UserRole.Teacher,
        'الشيخ الحالي',
      );
      const assistant = await registerAndLogin(
        'assistant-noop@test-reassign-staff.com',
        UserRole.Assistant,
        'المساعد الحالي',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص إعادة تعيين الكادر - بدون تغيير',
        teacher.userId,
        assistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.id).toBe(group.id);
      expect(body.data.teacher.id).toBe(teacher.userId);
      expect(body.data.assistant.id).toBe(assistant.userId);

      // Verify no audit row was created
      const auditRows: Array<{ id: string }> = await dataSource.query(
        "SELECT id FROM audit_entries WHERE actor_id = $1 AND action = 'STAFF_REASSIGNED' AND target_id = $2",
        [admin.userId, group.id],
      );
      expect(auditRows.length).toBe(0);
    });
  });

  // 4. Not-found group -> 404
  describe('Not Found', () => {
    it('returns 404 when group does not exist', async () => {
      const admin = await registerAndLogin(
        'admin-staff-nf@test-reassign-staff.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-nf-staff@test-reassign-staff.com',
        UserRole.Teacher,
      );

      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          teacher_id: teacher.userId,
        })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // 5. Role-based authorization tests (parameterized per TS.md)
  describe('Role-based authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .send({ teacher_id: uuidv7() })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth-staff@test-reassign-staff.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ teacher_id: teacher.userId })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth-staff@test-reassign-staff.com',
        UserRole.Assistant,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({ assistant_id: assistant.userId })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth-staff@test-reassign-staff.com',
        UserRole.Student,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ teacher_id: uuidv7() })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth-staff@test-reassign-staff.com',
        UserRole.User,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/staff`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ teacher_id: uuidv7() })
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
