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
import { GroupListItemLimitedDto } from '../../src/modules/groups/application/list-groups/group-list-item.dto';

describe('GET /groups/available (API-011 Integration)', () => {
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

    await cleanupDatabase();
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await cleanupDatabase();
    }
    await app.close();
  });

  async function cleanupDatabase() {
    await dataSource.query(
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-browse-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-browse-groups.com'",
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
          'UPDATE users SET password_hash = $1, gender = $2 WHERE id = $3',
          [hash, gender, adminId],
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

  async function seedGroup(params: {
    id?: string;
    name: string;
    gender: 'Male' | 'Female';
    recitationDay: number;
    enrollmentStatus?: 'Open' | 'Closed';
    lifecycleState?: 'Active' | 'Archived';
    teacherId: string;
    assistantId: string;
    createdBy: string;
    createdAt?: Date;
  }): Promise<string> {
    const groupId = params.id ?? uuidv7();
    await dataSource.query(
      `INSERT INTO groups (id, name, gender, recitation_day, enrollment_status, lifecycle_state, teacher_id, assistant_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        groupId,
        params.name,
        params.gender,
        params.recitationDay,
        params.enrollmentStatus ?? 'Open',
        params.lifecycleState ?? 'Active',
        params.teacherId,
        params.assistantId,
        params.createdBy,
        params.createdAt ?? new Date(),
        new Date(),
      ],
    );
    return groupId;
  }

  describe('Unauthenticated access', () => {
    it('returns 401 Unauthorized when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('User role query validation', () => {
    it('returns 422 GENDER_REQUIRED when User sends no gender parameter', async () => {
      const user = await registerAndLogin(
        `user-no-gender-${Date.now()}@test-browse-groups.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'GENDER_REQUIRED',
      });
    });

    it('returns 422 when User sends invalid gender value', async () => {
      const user = await registerAndLogin(
        `user-inv-gender-${Date.now()}@test-browse-groups.com`,
        UserRole.User,
      );

      await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Other')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('User role filtering', () => {
    it('User + ?gender=Male returns only Open + Active + Male groups (excludes Closed, Archived, Female)', async () => {
      const admin = await registerAndLogin(
        'admin-browse@test-browse-groups.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        `teacher-browse-${Date.now()}@test-browse-groups.com`,
        UserRole.Teacher,
        'معلم تجريبي',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-browse-${Date.now()}@test-browse-groups.com`,
        UserRole.Assistant,
        'مساعد تجريبي',
        'Male',
      );

      const openMaleGroupName = `حلقة رجال مفتوحة-${Date.now()}`;
      const openMaleGroupId = await seedGroup({
        name: openMaleGroupName,
        gender: 'Male',
        recitationDay: 1,
        enrollmentStatus: 'Open',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const closedMaleGroupId = await seedGroup({
        name: `حلقة رجال مغلقة-${Date.now()}`,
        gender: 'Male',
        recitationDay: 2,
        enrollmentStatus: 'Closed',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const archivedMaleGroupId = await seedGroup({
        name: `حلقة رجال مؤرشفة-${Date.now()}`,
        gender: 'Male',
        recitationDay: 3,
        enrollmentStatus: 'Open',
        lifecycleState: 'Archived',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const openFemaleGroupId = await seedGroup({
        name: `حلقة نساء مفتوحة-${Date.now()}`,
        gender: 'Female',
        recitationDay: 4,
        enrollmentStatus: 'Open',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const user = await registerAndLogin(
        `user-male-search-${Date.now()}@test-browse-groups.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemLimitedDto[] };
      const returnedIds = body.data.map((g) => g.id);

      expect(returnedIds).toContain(openMaleGroupId);
      expect(returnedIds).not.toContain(closedMaleGroupId);
      expect(returnedIds).not.toContain(archivedMaleGroupId);
      expect(returnedIds).not.toContain(openFemaleGroupId);

      // Verify shape
      const foundGroup = body.data.find((g) => g.id === openMaleGroupId);
      expect(foundGroup).toEqual({
        id: openMaleGroupId,
        name: openMaleGroupName,
        recitation_day: 1,
        enrollment_status: 'Open',
      });

      expect(foundGroup).not.toHaveProperty('teacher');
      expect(foundGroup).not.toHaveProperty('assistant');
      expect(foundGroup).not.toHaveProperty('gender');
      expect(foundGroup).not.toHaveProperty('lifecycle_state');
    });

    it('User + ?gender=Female returns only Open + Active + Female groups', async () => {
      const admin = await registerAndLogin(
        'admin-browse@test-browse-groups.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        `teacher-browse-f-${Date.now()}@test-browse-groups.com`,
        UserRole.Teacher,
        'معلمة تجريبية',
        'Female',
      );
      const assistant = await registerAndLogin(
        `assistant-browse-f-${Date.now()}@test-browse-groups.com`,
        UserRole.Assistant,
        'مساعدة تجريبية',
        'Female',
      );

      const openFemaleGroupId = await seedGroup({
        name: `حلقة نساء مفتوحة 2-${Date.now()}`,
        gender: 'Female',
        recitationDay: 5,
        enrollmentStatus: 'Open',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const user = await registerAndLogin(
        `user-fem-search-${Date.now()}@test-browse-groups.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Female')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemLimitedDto[] };
      const returnedIds = body.data.map((g) => g.id);
      expect(returnedIds).toContain(openFemaleGroupId);
    });
  });

  describe('Non-User role handling (query parameter ignored)', () => {
    it('Student with stored gender Male sends ?gender=Female but receives Male groups', async () => {
      const admin = await registerAndLogin(
        'admin-browse@test-browse-groups.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        `teacher-stu-test-${Date.now()}@test-browse-groups.com`,
        UserRole.Teacher,
        'معلم',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-stu-test-${Date.now()}@test-browse-groups.com`,
        UserRole.Assistant,
        'مساعد',
        'Male',
      );

      const maleGroupId = await seedGroup({
        name: `حلقة رجال للطالب-${Date.now()}`,
        gender: 'Male',
        recitationDay: 1,
        enrollmentStatus: 'Open',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const femaleGroupId = await seedGroup({
        name: `حلقة نساء للطالب-${Date.now()}`,
        gender: 'Female',
        recitationDay: 2,
        enrollmentStatus: 'Open',
        lifecycleState: 'Active',
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const student = await registerAndLogin(
        `student-male-${Date.now()}@test-browse-groups.com`,
        UserRole.Student,
        'طالب ذكر',
        'Male',
      );

      // Student sends mismatched ?gender=Female
      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Female')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemLimitedDto[] };
      const returnedIds = body.data.map((g) => g.id);

      expect(returnedIds).toContain(maleGroupId);
      expect(returnedIds).not.toContain(femaleGroupId);
    });

    it('Admin with null stored gender receives { data: [] }', async () => {
      const admin = await registerAndLogin(
        'admin-browse@test-browse-groups.com',
        UserRole.Admin,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('Sorting and Envelope', () => {
    it('returns available groups ordered by created_at DESC with no pagination key', async () => {
      const admin = await registerAndLogin(
        'admin-browse@test-browse-groups.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        `teacher-sort-${Date.now()}@test-browse-groups.com`,
        UserRole.Teacher,
        'معلم',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-sort-${Date.now()}@test-browse-groups.com`,
        UserRole.Assistant,
        'مساعد',
        'Male',
      );

      const time1 = new Date('2026-08-01T10:00:00Z');
      const time2 = new Date('2026-08-02T10:00:00Z');
      const time3 = new Date('2026-08-03T10:00:00Z');

      const g1 = await seedGroup({
        name: `حلقة ترتيب 1-${Date.now()}`,
        gender: 'Male',
        recitationDay: 1,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time1,
      });

      const g2 = await seedGroup({
        name: `حلقة ترتيب 2-${Date.now()}`,
        gender: 'Male',
        recitationDay: 2,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time2,
      });

      const g3 = await seedGroup({
        name: `حلقة ترتيب 3-${Date.now()}`,
        gender: 'Male',
        recitationDay: 3,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time3,
      });

      const user = await registerAndLogin(
        `user-sort-${Date.now()}@test-browse-groups.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemLimitedDto[] };
      const ids = body.data.map((g) => g.id);
      const idx1 = ids.indexOf(g1);
      const idx2 = ids.indexOf(g2);
      const idx3 = ids.indexOf(g3);

      expect(idx3).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx1);

      expect(res.body).toHaveProperty('data');
      expect(res.body).not.toHaveProperty('pagination');
      expect(res.body).not.toHaveProperty('total');
    });
  });
});
