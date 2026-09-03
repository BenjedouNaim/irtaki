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
import {
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

describe('POST /groups (API-013 Integration)', () => {
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
    await purgeNotificationLog(dataSource);
    await dataSource.query(
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com') OR name LIKE '%حلقة فحص إنشاء%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-create-group.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-create-group.com'",
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

  // 1. Valid create -> 201, shape match, audit_entries check
  describe('Valid create by Admin', () => {
    it('creates group with 201, enrollment_status=Closed, lifecycle_state=Active, and writes AuditEntry', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-1@test-create-group.com',
        UserRole.Teacher,
        'الشيخ محمود الحصري',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-1@test-create-group.com',
        UserRole.Assistant,
        'الأستاذ سامي المهدوي',
        'Male',
      );

      const payload = {
        name: 'حلقة فحص إنشاء - قالون 1',
        gender: 'Male',
        recitation_day: 3,
        teacher_id: teacher.userId,
        assistant_id: assistant.userId,
      };

      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send(payload)
        .expect(HttpStatus.CREATED);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe(payload.name);
      expect(body.data.gender).toBe('Male');
      expect(body.data.recitation_day).toBe(3);
      expect(body.data.enrollment_status).toBe('Closed');
      expect(body.data.lifecycle_state).toBe('Active');
      expect(body.data.teacher).toEqual({
        id: teacher.userId,
        full_name: 'الشيخ محمود الحصري',
      });
      expect(body.data.assistant).toEqual({
        id: assistant.userId,
        full_name: 'الأستاذ سامي المهدوي',
      });

      // Verify audit_entries row was written
      const auditRows: Array<{
        actor_id: string;
        target_type: string;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT * FROM audit_entries WHERE action = 'GROUP_CREATED' AND target_id = $1",
        [body.data.id],
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].actor_id).toBe(admin.userId);
      expect(auditRows[0].target_type).toBe('Group');
      expect(auditRows[0].new_value).toMatchObject({
        name: payload.name,
        gender: 'Male',
        recitation_day: 3,
        teacher_id: teacher.userId,
        assistant_id: assistant.userId,
        enrollment_status: 'Closed',
        lifecycle_state: 'Active',
      });
    });
  });

  // 2 & 3. VR-24: Unqualified staff
  describe('VR-24 Staff Validation', () => {
    it('returns 422 with VR-24 detail when teacher is not a Teacher role', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const studentAsTeacher = await registerAndLogin(
        'student-as-teacher@test-create-group.com',
        UserRole.Student,
        'طالب عادي',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-2@test-create-group.com',
        UserRole.Assistant,
        'مساعد صالح',
        'Male',
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'حلقة فحص إنشاء - خطأ معلم',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: studentAsTeacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = res.body as {
        statusCode: number;
        details: Array<{ field: string; rule: string }>;
      };
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'teacher_id', rule: 'VR-24' }),
        ]),
      );
    });

    it('returns 422 with VR-24 detail when assistant is not an Assistant role', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-3@test-create-group.com',
        UserRole.Teacher,
        'معلم صالح',
        'Male',
      );
      const userAsAssistant = await registerAndLogin(
        'user-as-assistant@test-create-group.com',
        UserRole.User,
        'مستخدم عادي',
        'Male',
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'حلقة فحص إنشاء - خطأ مساعد',
          gender: 'Male',
          recitation_day: 2,
          teacher_id: teacher.userId,
          assistant_id: userAsAssistant.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      const body = res.body as {
        statusCode: number;
        details: Array<{ field: string; rule: string }>;
      };
      expect(body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'assistant_id', rule: 'VR-24' }),
        ]),
      );
    });
  });

  // 4 & 5. DTO Validation
  describe('DTO Validation', () => {
    it('returns 422 on invalid gender', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-4@test-create-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-4@test-create-group.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'حلقة فحص إنشاء - جنس خاطئ',
          gender: 'Other',
          recitation_day: 1,
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('returns 422 on invalid recitation_day (0 and 8)', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-5@test-create-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-5@test-create-group.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'حلقة فحص إنشاء - يوم 0',
          gender: 'Male',
          recitation_day: 0,
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: 'حلقة فحص إنشاء - يوم 8',
          gender: 'Female',
          recitation_day: 8,
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  // 6. Duplicate Name -> 409
  describe('Duplicate group name', () => {
    it('returns 409 GROUP_NAME_TAKEN when group with same name already exists', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-6@test-create-group.com',
        UserRole.Teacher,
        'الشيخ سعيد',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-6@test-create-group.com',
        UserRole.Assistant,
        'الأستاذ رمزي',
        'Male',
      );

      const duplicateName = 'حلقة فحص إنشاء - اسم مكرر';

      // Create first group
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: duplicateName,
          gender: 'Male',
          recitation_day: 4,
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.CREATED);

      // Attempt to create second group with same name
      const res = await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({
          name: duplicateName,
          gender: 'Female',
          recitation_day: 6,
          teacher_id: teacher.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.CONFLICT);

      const body = res.body as { statusCode: number; error: string };
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(body.error).toBe('GROUP_NAME_TAKEN');
    });
  });

  // 7. Concurrency race test
  describe('Concurrency Race', () => {
    it('handles near-simultaneous POST requests with identical names: exactly one 201, one 409, 1 DB row', async () => {
      const admin = await registerAndLogin(
        'admin-create@test-create-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-7@test-create-group.com',
        UserRole.Teacher,
        'الشيخ أنيس',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-7@test-create-group.com',
        UserRole.Assistant,
        'الأستاذ فوزي',
        'Male',
      );

      const concurrentName = 'حلقة فحص إنشاء - سباق متزامن';

      const payload1 = {
        name: concurrentName,
        gender: 'Male',
        recitation_day: 1,
        teacher_id: teacher.userId,
        assistant_id: assistant.userId,
      };

      const payload2 = {
        name: concurrentName,
        gender: 'Female',
        recitation_day: 2,
        teacher_id: teacher.userId,
        assistant_id: assistant.userId,
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send(payload1),
        request(app.getHttpServer())
          .post('/api/v1/groups')
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send(payload2),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

      const conflictRes =
        res1.status === Number(HttpStatus.CONFLICT) ? res1 : res2;

      expect((conflictRes.body as { error: string }).error).toBe(
        'GROUP_NAME_TAKEN',
      );

      // Verify only 1 row exists in DB
      const dbRows: Array<{ id: string; name: string }> =
        await dataSource.query('SELECT id, name FROM groups WHERE name = $1', [
          concurrentName,
        ]);
      expect(dbRows.length).toBe(1);
    });
  });

  // 8. Authorization negative tests
  describe('Authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .send({
          name: 'حلقة غير مصرح',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: uuidv7(),
          assistant_id: uuidv7(),
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth@test-create-group.com',
        UserRole.Teacher,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({
          name: 'حلقة محظورة',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: teacher.userId,
          assistant_id: teacher.userId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth@test-create-group.com',
        UserRole.Assistant,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({
          name: 'حلقة محظورة',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: assistant.userId,
          assistant_id: assistant.userId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth@test-create-group.com',
        UserRole.Student,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({
          name: 'حلقة محظورة',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: student.userId,
          assistant_id: student.userId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth@test-create-group.com',
        UserRole.User,
      );

      await request(app.getHttpServer())
        .post('/api/v1/groups')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({
          name: 'حلقة محظورة',
          gender: 'Male',
          recitation_day: 1,
          teacher_id: user.userId,
          assistant_id: user.userId,
        })
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
