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

describe('GET /groups (API-010 Integration)', () => {
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

    await dataSource.query(
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-groups.com'",
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com'))",
      );
      await dataSource.query(
        "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
      );
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-groups.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-groups.com'",
      );
    }
    await app.close();
  });

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

  describe('Unauthenticated access', () => {
    it('returns 401 Unauthorized when no token is provided', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/groups')
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Admin scope', () => {
    it('returns all groups with full shape including embedded teacher and assistant objects', async () => {
      const admin = await registerAndLogin(
        'admin-groups@test-groups.com',
        UserRole.Admin,
      );

      const teacher = await registerAndLogin(
        `teacher-a-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'الشيخ بن عاشور',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-a-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'الأستاذ الصادق',
        'Male',
      );

      const uniqueGroupName = `حلقة الزيتونة-${Date.now()}`;
      const groupId = await seedGroup({
        name: uniqueGroupName,
        gender: 'Male',
        recitationDay: 1,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto[] };
      expect(body).toHaveProperty('data');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).not.toHaveProperty('pagination');

      const foundGroup = body.data.find((g) => g.id === groupId);
      expect(foundGroup).toBeDefined();
      expect(foundGroup).toEqual({
        id: groupId,
        name: uniqueGroupName,
        gender: 'Male',
        recitation_day: 1,
        enrollment_status: 'Open',
        lifecycle_state: 'Active',
        teacher: {
          id: teacher.userId,
          full_name: 'الشيخ بن عاشور',
        },
        assistant: {
          id: assistant.userId,
          full_name: 'الأستاذ الصادق',
        },
      });
    });
  });

  describe('Teacher / Assistant scope & Negative IDOR tests', () => {
    it('Teacher sees only assigned groups and NOT unassigned groups', async () => {
      const admin = await registerAndLogin(
        'admin-groups@test-groups.com',
        UserRole.Admin,
      );

      const teacher1 = await registerAndLogin(
        `teacher1-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'الشيخ 1',
        'Male',
      );
      const teacher2 = await registerAndLogin(
        `teacher2-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'الشيخ 2',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-comm-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'المساعد العام',
        'Male',
      );

      const group1Id = await seedGroup({
        name: `حلقة المعلم 1-${Date.now()}`,
        gender: 'Male',
        recitationDay: 2,
        teacherId: teacher1.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const group2Id = await seedGroup({
        name: `حلقة المعلم 2-${Date.now()}`,
        gender: 'Male',
        recitationDay: 3,
        teacherId: teacher2.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${teacher1.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto[] };
      const returnedGroupIds = body.data.map((g) => g.id);
      expect(returnedGroupIds).toContain(group1Id);
      // Negative / IDOR check: teacher2's group is strictly excluded
      expect(returnedGroupIds).not.toContain(group2Id);
    });

    it('Assistant sees only assigned groups and NOT unassigned groups', async () => {
      const admin = await registerAndLogin(
        'admin-groups@test-groups.com',
        UserRole.Admin,
      );

      const teacher = await registerAndLogin(
        `teacher-ast-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'الشيخ المربي',
        'Male',
      );
      const assistant1 = await registerAndLogin(
        `assistant1-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'المساعد 1',
        'Male',
      );
      const assistant2 = await registerAndLogin(
        `assistant2-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'المساعد 2',
        'Male',
      );

      const group1Id = await seedGroup({
        name: `حلقة المساعد 1-${Date.now()}`,
        gender: 'Male',
        recitationDay: 4,
        teacherId: teacher.userId,
        assistantId: assistant1.userId,
        createdBy: admin.userId,
      });

      const group2Id = await seedGroup({
        name: `حلقة المساعد 2-${Date.now()}`,
        gender: 'Male',
        recitationDay: 5,
        teacherId: teacher.userId,
        assistantId: assistant2.userId,
        createdBy: admin.userId,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${assistant1.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto[] };
      const returnedGroupIds = body.data.map((g) => g.id);
      expect(returnedGroupIds).toContain(group1Id);
      // Negative / IDOR check: assistant2's group is strictly excluded
      expect(returnedGroupIds).not.toContain(group2Id);
    });
  });

  describe('Student scope', () => {
    it('returns limited shape with only assigned group and stripped staff/internal fields', async () => {
      const admin = await registerAndLogin(
        'admin-groups@test-groups.com',
        UserRole.Admin,
      );

      const teacher = await registerAndLogin(
        `teacher-stu-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'المعلم فلان',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-stu-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'المساعد فلان',
        'Male',
      );
      const student = await registerAndLogin(
        `student-${Date.now()}@test-groups.com`,
        UserRole.Student,
        'الطالب نجيب',
        'Male',
      );

      const groupName = `حلقة الطالب نجيب-${Date.now()}`;
      const groupId = await seedGroup({
        name: groupName,
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
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        data: [
          {
            id: groupId,
            name: groupName,
            recitation_day: 6,
            enrollment_status: 'Open',
          },
        ],
      });

      // Mass-exposure / leak prevention check
      const body = res.body as { data: Record<string, unknown>[] };
      const studentItem = body.data[0];
      expect(studentItem).not.toHaveProperty('teacher');
      expect(studentItem).not.toHaveProperty('assistant');
      expect(studentItem).not.toHaveProperty('gender');
      expect(studentItem).not.toHaveProperty('lifecycle_state');
      expect(studentItem).not.toHaveProperty('created_at');
    });

    it('returns 200 with empty array { data: [] } for Student without active membership', async () => {
      const student = await registerAndLogin(
        `student-no-group-${Date.now()}@test-groups.com`,
        UserRole.Student,
        'طالب بدون حلقة',
        'Male',
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${student.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('User scope', () => {
    it('returns 200 with empty array { data: [] } (not 403 or 404)', async () => {
      const user = await registerAndLogin(
        `plain-user-${Date.now()}@test-groups.com`,
        UserRole.User,
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({ data: [] });
    });
  });

  describe('Sorting and Envelope', () => {
    it('returns groups ordered by created_at DESC with no pagination key', async () => {
      const admin = await registerAndLogin(
        'admin-groups@test-groups.com',
        UserRole.Admin,
      );

      const teacher = await registerAndLogin(
        `teacher-sort-${Date.now()}@test-groups.com`,
        UserRole.Teacher,
        'معلم الترتيب',
        'Male',
      );
      const assistant = await registerAndLogin(
        `assistant-sort-${Date.now()}@test-groups.com`,
        UserRole.Assistant,
        'مساعد الترتيب',
        'Male',
      );

      const time1 = new Date('2026-08-01T10:00:00Z');
      const time2 = new Date('2026-08-02T10:00:00Z');
      const time3 = new Date('2026-08-03T10:00:00Z');

      const g1 = await seedGroup({
        name: `حلقة قديمة-${Date.now()}`,
        gender: 'Male',
        recitationDay: 1,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time1,
      });

      const g2 = await seedGroup({
        name: `حلقة متوسطة-${Date.now()}`,
        gender: 'Male',
        recitationDay: 2,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time2,
      });

      const g3 = await seedGroup({
        name: `حلقة حديثة-${Date.now()}`,
        gender: 'Male',
        recitationDay: 3,
        teacherId: teacher.userId,
        assistantId: assistant.userId,
        createdBy: admin.userId,
        createdAt: time3,
      });

      const res = await request(app.getHttpServer())
        .get('/api/v1/groups')
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto[] };
      const ids = body.data.map((g) => g.id);
      const idx1 = ids.indexOf(g1);
      const idx2 = ids.indexOf(g2);
      const idx3 = ids.indexOf(g3);

      expect(idx3).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx1);

      // Envelope check
      expect(res.body).toHaveProperty('data');
      expect(res.body).not.toHaveProperty('pagination');
      expect(res.body).not.toHaveProperty('total');
    });
  });
});
