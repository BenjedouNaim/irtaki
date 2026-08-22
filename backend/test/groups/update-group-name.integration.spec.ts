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

describe('PATCH /groups/:id (API-014 Integration)', () => {
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
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com') OR name LIKE '%حلقة فحص تحديث%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-update-group-name.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-update-group-name.com'",
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

  // 1. Valid rename by Admin
  describe('Valid rename by Admin', () => {
    it('renames group, returns 200 with updated name and unchanged fields', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-1@test-update-group-name.com',
        UserRole.Teacher,
        'الشيخ علي المنصوري',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-1@test-update-group-name.com',
        UserRole.Assistant,
        'الأستاذ كمال',
        'Male',
      );

      const initialName = 'حلقة فحص تحديث - الاسم الأصلي';
      const newName = 'حلقة فحص تحديث - الاسم الجديد المعين';

      const created = await createTestGroup(
        admin.accessToken,
        initialName,
        teacher.userId,
        assistant.userId,
        'Male',
        4,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${created.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: newName })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe(newName);
      expect(body.data.gender).toBe(created.gender);
      expect(body.data.recitation_day).toBe(created.recitation_day);
      expect(body.data.enrollment_status).toBe(created.enrollment_status);
      expect(body.data.lifecycle_state).toBe(created.lifecycle_state);
      expect(body.data.teacher).toEqual(created.teacher);
      expect(body.data.assistant).toEqual(created.assistant);
    });
  });

  // 2. Duplicate name -> 409 GROUP_NAME_TAKEN
  describe('Duplicate group name', () => {
    it('returns 409 GROUP_NAME_TAKEN when renaming to an existing group name', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-2@test-update-group-name.com',
        UserRole.Teacher,
        'الشيخ حمزة',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-2@test-update-group-name.com',
        UserRole.Assistant,
        'الأستاذ مراد',
        'Male',
      );

      const group1Name = 'حلقة فحص تحديث - مجموعة أولى';
      const group2Name = 'حلقة فحص تحديث - مجموعة ثانية';

      await createTestGroup(
        admin.accessToken,
        group1Name,
        teacher.userId,
        assistant.userId,
      );
      const group2 = await createTestGroup(
        admin.accessToken,
        group2Name,
        teacher.userId,
        assistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group2.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: group1Name })
        .expect(HttpStatus.CONFLICT);

      const body = res.body as { statusCode: number; error: string };
      expect(body.statusCode).toBe(HttpStatus.CONFLICT);
      expect(body.error).toBe('GROUP_NAME_TAKEN');
    });
  });

  // 3. Concurrency race test
  describe('Concurrency Race', () => {
    it('handles near-simultaneous PATCH requests with identical names: exactly one 200, one 409', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-3@test-update-group-name.com',
        UserRole.Teacher,
        'الشيخ وسام',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-3@test-update-group-name.com',
        UserRole.Assistant,
        'الأستاذ توفيق',
        'Male',
      );

      const groupA = await createTestGroup(
        admin.accessToken,
        'حلقة فحص تحديث - سباق أ',
        teacher.userId,
        assistant.userId,
      );
      const groupB = await createTestGroup(
        admin.accessToken,
        'حلقة فحص تحديث - سباق ب',
        teacher.userId,
        assistant.userId,
      );

      const targetRaceName = 'حلقة فحص تحديث - اسم السباق المشترك';

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/groups/${groupA.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: targetRaceName }),
        request(app.getHttpServer())
          .patch(`/api/v1/groups/${groupB.id}`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ name: targetRaceName }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.CONFLICT]);

      const conflictRes =
        res1.status === Number(HttpStatus.CONFLICT) ? res1 : res2;
      expect((conflictRes.body as { error: string }).error).toBe(
        'GROUP_NAME_TAKEN',
      );

      // Verify only 1 group has that target name in the DB
      const dbRows: Array<{ id: string; name: string }> =
        await dataSource.query('SELECT id, name FROM groups WHERE name = $1', [
          targetRaceName,
        ]);
      expect(dbRows.length).toBe(1);
    });
  });

  // 4. Validation errors
  describe('Validation', () => {
    it('returns 422 when name is empty string', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-4@test-update-group-name.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-4@test-update-group-name.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص تحديث - للتحقق فارغ',
        teacher.userId,
        assistant.userId,
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: '' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('returns 422 when name is missing', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-5@test-update-group-name.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-5@test-update-group-name.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص تحديث - للتحقق مفقود',
        teacher.userId,
        assistant.userId,
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  // 5. Not found
  describe('Not Found', () => {
    it('returns 404 when group ID does not exist', async () => {
      const admin = await registerAndLogin(
        'admin-update@test-update-group-name.com',
        UserRole.Admin,
      );

      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ name: 'حلقة فحص تحديث - غير موجودة' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // 6. Authorization negative tests
  describe('Authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .send({ name: 'حلقة غير مصرح' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth@test-update-group-name.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ name: 'حلقة محظورة' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth@test-update-group-name.com',
        UserRole.Assistant,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({ name: 'حلقة محظورة' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth@test-update-group-name.com',
        UserRole.Student,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ name: 'حلقة محظورة' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth@test-update-group-name.com',
        UserRole.User,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ name: 'حلقة محظورة' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
