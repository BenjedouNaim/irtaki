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

describe('GET /groups/:id (API-012 Integration)', () => {
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
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-detail.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-detail.com'",
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

  async function seedMembership(params: {
    userId: string;
    groupId: string;
    state?: 'Active' | 'Terminated';
  }): Promise<string> {
    const membershipId = uuidv7();
    await dataSource.query(
      `INSERT INTO memberships (id, user_id, group_id, state, started_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        membershipId,
        params.userId,
        params.groupId,
        params.state ?? 'Active',
        '2026-08-01',
        new Date(),
        new Date(),
      ],
    );
    return membershipId;
  }

  // 1. Unauthenticated -> 401
  describe('Unauthenticated access', () => {
    it('returns 401 Unauthorized when no token is provided', async () => {
      const dummyId = uuidv7();
      await request(app.getHttpServer())
        .get(`/api/v1/groups/${dummyId}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  // 2 & 3. Admin scope
  describe('Admin scope', () => {
    it('returns 200 with full shape for any group', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-1@test-detail.com',
        UserRole.Teacher,
        'الشيخ منصور',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-1@test-detail.com',
        UserRole.Assistant,
        'الأستاذ سامي',
        'Male',
      );

      const groupId = await seedGroup({
        name: 'حلقة قالون - تفصيل أدمين',
        gender: 'Male',
        recitationDay: 4,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(groupId);
      expect(body.data.name).toBe('حلقة قالون - تفصيل أدمين');
      expect(body.data.gender).toBe('Male');
      expect(body.data.recitation_day).toBe(4);
      expect(body.data.enrollment_status).toBe('Open');
      expect(body.data.lifecycle_state).toBe('Active');
      expect(body.data.teacher).toEqual({
        id: teacher.userId,
        full_name: 'الشيخ منصور',
      });
      expect(body.data.assistant).toEqual({
        id: assistant.userId,
        full_name: 'الأستاذ سامي',
      });
    });

    it('returns 403 Forbidden for nonexistent group id (NFR-20)', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const nonexistentId = uuidv7();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${nonexistentId}`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);

      const body = res.body as { statusCode: number; error: string };
      expect(body.statusCode).toBe(HttpStatus.FORBIDDEN);
    });
  });

  // 4 & 5. Teacher scope
  describe('Teacher scope', () => {
    it('returns 200 with full shape for assigned group', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-2@test-detail.com',
        UserRole.Teacher,
        'الشيخ خالد',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-2@test-detail.com',
        UserRole.Assistant,
        'الأستاذ عمر',
        'Male',
      );

      const groupId = await seedGroup({
        name: 'حلقة قالون - المعلم خالد',
        gender: 'Male',
        recitationDay: 2,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.id).toBe(groupId);
      expect(body.data.teacher.id).toBe(teacher.userId);
      expect(body.data.assistant.id).toBe(assistant.userId);
    });

    it('returns 403 Forbidden for unassigned group (IDOR)', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher1 = await registerAndLogin(
        'teacher-detail-3@test-detail.com',
        UserRole.Teacher,
        'الشيخ عثمان',
        'Male',
      );
      const teacher2 = await registerAndLogin(
        'teacher-detail-4@test-detail.com',
        UserRole.Teacher,
        'الشيخ بلال',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-3@test-detail.com',
        UserRole.Assistant,
        'الأستاذ حمزة',
        'Male',
      );

      const groupTeacher2 = await seedGroup({
        name: 'حلقة قالون - المعلم بلال',
        gender: 'Male',
        recitationDay: 1,
        teacherId: teacher2.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupTeacher2}`)
        .set('Authorization', `Bearer ${teacher1.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // 6 & 7. Assistant scope
  describe('Assistant scope', () => {
    it('returns 200 with full shape for assigned group', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-5@test-detail.com',
        UserRole.Teacher,
        'الشيخ صالح',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-4@test-detail.com',
        UserRole.Assistant,
        'الأستاذ وليد',
        'Male',
      );

      const groupId = await seedGroup({
        name: 'حلقة قالون - المساعد وليد',
        gender: 'Male',
        recitationDay: 5,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.id).toBe(groupId);
      expect(body.data.teacher.id).toBe(teacher.userId);
      expect(body.data.assistant.id).toBe(assistant.userId);
    });

    it('returns 403 Forbidden for unassigned group (IDOR)', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-6@test-detail.com',
        UserRole.Teacher,
        'الشيخ راشد',
        'Male',
      );
      const assistant1 = await registerAndLogin(
        'assistant-detail-5@test-detail.com',
        UserRole.Assistant,
        'الأستاذ زياد',
        'Male',
      );
      const assistant2 = await registerAndLogin(
        'assistant-detail-6@test-detail.com',
        UserRole.Assistant,
        'الأستاذ مروان',
        'Male',
      );

      const groupAssignedToAssistant2 = await seedGroup({
        name: 'حلقة قالون - المساعد مروان',
        gender: 'Male',
        recitationDay: 3,
        teacherId: teacher.userId,
        assistantId: assistant2.userId,
        createdBy: admin.userId,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupAssignedToAssistant2}`)
        .set('Authorization', `Bearer ${assistant1.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // 8, 9, 10. Student scope
  describe('Student scope', () => {
    it('returns 200 with limited shape for own active group (no staff, gender, or lifecycle)', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-7@test-detail.com',
        UserRole.Teacher,
        'الشيخ يونس',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-7@test-detail.com',
        UserRole.Assistant,
        'الأستاذ كريم',
        'Male',
      );
      const student = await registerAndLogin(
        'student-detail-1@test-detail.com',
        UserRole.Student,
        'الطالب أحمد',
        'Male',
      );

      const groupId = await seedGroup({
        name: 'حلقة قالون - الطالب أحمد',
        gender: 'Male',
        recitationDay: 6,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Active',
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: Record<string, unknown> };
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(groupId);
      expect(body.data.name).toBe('حلقة قالون - الطالب أحمد');
      expect(body.data.recitation_day).toBe(6);
      expect(body.data.enrollment_status).toBe('Open');

      // Explicitly assert absence of restricted fields per API-012
      expect(body.data).not.toHaveProperty('teacher');
      expect(body.data).not.toHaveProperty('assistant');
      expect(body.data).not.toHaveProperty('gender');
      expect(body.data).not.toHaveProperty('lifecycle_state');
    });

    it('returns 403 Forbidden for group the student is not a member of (IDOR)', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-8@test-detail.com',
        UserRole.Teacher,
        'الشيخ زكريا',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-8@test-detail.com',
        UserRole.Assistant,
        'الأستاذ فاروق',
        'Male',
      );
      const student = await registerAndLogin(
        'student-detail-2@test-detail.com',
        UserRole.Student,
        'الطالب يحيى',
        'Male',
      );

      const unjoinedGroupId = await seedGroup({
        name: 'حلقة قالون - غير ملتحق',
        gender: 'Male',
        recitationDay: 1,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${unjoinedGroupId}`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for group where student membership is Terminated', async () => {
      const admin = await registerAndLogin(
        'admin-detail@test-detail.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-detail-9@test-detail.com',
        UserRole.Teacher,
        'الشيخ إبراهيم',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-detail-9@test-detail.com',
        UserRole.Assistant,
        'الأستاذ توفيق',
        'Male',
      );
      const student = await registerAndLogin(
        'student-detail-3@test-detail.com',
        UserRole.Student,
        'الطالب طارق',
        'Male',
      );

      const groupId = await seedGroup({
        name: 'حلقة قالون - عضوية منتهية',
        gender: 'Male',
        recitationDay: 3,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      await seedMembership({
        userId: student.userId,
        groupId,
        state: 'Terminated',
      });

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${groupId}`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // 11. User role -> 403
  describe('User role', () => {
    it('returns 403 Forbidden for User role (RolesGuard)', async () => {
      const user = await registerAndLogin(
        'user-detail-1@test-detail.com',
        UserRole.User,
      );
      const dummyId = uuidv7();

      await request(app.getHttpServer())
        .get(`/api/v1/groups/${dummyId}`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
