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
  GROUP_REPOSITORY,
  IGroupRepository,
} from '../../src/modules/groups/domain/group.repository.interface';

describe('PATCH /groups/:id/enrollment (API-015 Integration)', () => {
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
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com') OR name LIKE '%حلقة فحص حالة التسجيل%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-toggle-enrollment.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-toggle-enrollment.com'",
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

  // 1. Valid toggle by assigned Teacher (Closed -> Open, Open -> Closed) + Audit assertions
  describe('Valid toggle by assigned Teacher', () => {
    it('successfully opens enrollment (Closed -> Open) and writes audit entry', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-toggle-1@test-toggle-enrollment.com',
        UserRole.Teacher,
        'الشيخ علي التونسي',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-toggle-1@test-toggle-enrollment.com',
        UserRole.Assistant,
        'الأستاذ كمال',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - فتح',
        teacher.userId,
        assistant.userId,
      );

      // Default created group is Closed
      expect(group.enrollment_status).toBe('Closed');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data).toBeDefined();
      expect(body.data.id).toBe(group.id);
      expect(body.data.enrollment_status).toBe('Open');
      expect(body.data.lifecycle_state).toBe('Active');

      // Assert audit entry
      const auditRows: Array<{
        action: string;
        target_type: string;
        target_id: string;
        previous_value: Record<string, unknown>;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT action, target_type, target_id, previous_value, new_value FROM audit_entries WHERE actor_id = $1 AND action = 'ENROLLMENT_TOGGLED'",
        [teacher.userId],
      );
      expect(auditRows.length).toBe(1);
      expect(auditRows[0].target_type).toBe('Group');
      expect(auditRows[0].target_id).toBe(group.id);
      expect(auditRows[0].previous_value).toEqual({
        enrollment_status: 'Closed',
      });
      expect(auditRows[0].new_value).toEqual({ enrollment_status: 'Open' });
    });

    it('successfully closes enrollment (Open -> Closed) and writes audit entry', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-toggle-2@test-toggle-enrollment.com',
        UserRole.Teacher,
        'الشيخ حمزة',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-toggle-2@test-toggle-enrollment.com',
        UserRole.Assistant,
        'الأستاذ مراد',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - إغلاق',
        teacher.userId,
        assistant.userId,
      );

      // First open it
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.OK);

      // Now close it
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Closed' })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.enrollment_status).toBe('Closed');

      // Check last audit entry
      const auditRows: Array<{
        action: string;
        target_type: string;
        target_id: string;
        previous_value: Record<string, unknown>;
        new_value: Record<string, unknown>;
      }> = await dataSource.query(
        "SELECT action, target_type, target_id, previous_value, new_value FROM audit_entries WHERE actor_id = $1 AND action = 'ENROLLMENT_TOGGLED' ORDER BY occurred_at DESC",
        [teacher.userId],
      );
      expect(auditRows.length).toBe(2);
      expect(auditRows[0].previous_value).toEqual({
        enrollment_status: 'Open',
      });
      expect(auditRows[0].new_value).toEqual({ enrollment_status: 'Closed' });
    });
  });

  // 2. Unassigned Teacher -> 403 Forbidden
  describe('Unassigned Teacher', () => {
    it('returns 403 Forbidden when an unassigned teacher tries to toggle enrollment', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const assignedTeacher = await registerAndLogin(
        'teacher-assigned@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const unassignedTeacher = await registerAndLogin(
        'teacher-unassigned@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-toggle-3@test-toggle-enrollment.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - أستاذ آخر',
        assignedTeacher.userId,
        assistant.userId,
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${unassignedTeacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);

      // Verify DB unchanged
      const rows: Array<{ enrollment_status: string }> = await dataSource.query(
        'SELECT enrollment_status FROM groups WHERE id = $1',
        [group.id],
      );
      expect(rows[0].enrollment_status).toBe('Closed');
    });
  });

  // 3. Masked 403 on Not Found
  describe('Not Found', () => {
    it('returns 403 Forbidden (masked) when group does not exist', async () => {
      const teacher = await registerAndLogin(
        'teacher-nf@test-toggle-enrollment.com',
        UserRole.Teacher,
      );

      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });

  // 4. Archived group no-op (BR-42)
  describe('Archived group (BR-42 no-op)', () => {
    it('returns 200 with unchanged state and writes NO audit entry when group is archived', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-archived@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-archived@test-toggle-enrollment.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - مؤرشفة',
        teacher.userId,
        assistant.userId,
      );

      // Archive group directly in database
      await dataSource.query(
        "UPDATE groups SET lifecycle_state = 'Archived', archived_at = NOW() WHERE id = $1",
        [group.id],
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.enrollment_status).toBe('Closed'); // Still Closed
      expect(body.data.lifecycle_state).toBe('Archived');

      // Assert no audit entry was written
      const auditRows: Array<{ id: string }> = await dataSource.query(
        "SELECT id FROM audit_entries WHERE actor_id = $1 AND action = 'ENROLLMENT_TOGGLED'",
        [teacher.userId],
      );
      expect(auditRows.length).toBe(0);
    });
  });

  // 5. Archival racing the toggle (BR-42, TS §20)
  describe('Archival racing the toggle (BR-42 under concurrency)', () => {
    it('holds the BR-42 no-op when the group is archived inside the check-then-write window', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-toctou@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-toctou@test-toggle-enrollment.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - سباق الأرشفة',
        teacher.userId,
        assistant.userId,
      );

      // A Promise.all race almost always takes the benign interleaving, so the
      // window is opened deliberately: the archival commits between the use
      // case's lifecycle read and its UPDATE, which is the exact ordering the
      // fast-path check cannot see.
      const groupRepository = app.get<IGroupRepository>(GROUP_REPOSITORY);

      // The snapshot the use case is about to read, captured while the group
      // is genuinely still Active.
      const staleActiveRow = await groupRepository.findByIdForDetail(group.id);
      expect(staleActiveRow?.lifecycle_state).toBe('Active');

      const spy = jest
        .spyOn(groupRepository, 'findByIdForDetail')
        .mockImplementationOnce(async (id: string) => {
          // The Admin's archival commits between the read and the write. Only
          // this first call is intercepted; the no-op branch's re-read falls
          // through to the real query.
          await dataSource.query(
            "UPDATE groups SET lifecycle_state = 'Archived', archived_at = NOW() WHERE id = $1",
            [id],
          );
          return staleActiveRow;
        });

      try {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/groups/${group.id}/enrollment`)
          .set('Authorization', `Bearer ${teacher.accessToken}`)
          .send({ enrollment_status: 'Open' })
          .expect(HttpStatus.OK);

        // The documented loser response: 200 with the unchanged state, not an
        // error (APIS §10.4).
        const body = res.body as { data: GroupListItemDto };
        expect(body.data.enrollment_status).toBe('Closed');
        expect(body.data.lifecycle_state).toBe('Archived');
      } finally {
        spy.mockRestore();
      }

      // The write never landed on the archived group...
      const rows: Array<{
        enrollment_status: string;
        lifecycle_state: string;
      }> = await dataSource.query(
        'SELECT enrollment_status, lifecycle_state FROM groups WHERE id = $1',
        [group.id],
      );
      expect(rows[0].enrollment_status).toBe('Closed');
      expect(rows[0].lifecycle_state).toBe('Archived');

      // ...so no audit row claims a transition BR-42 forbids.
      const auditRows: Array<{ id: string }> = await dataSource.query(
        "SELECT id FROM audit_entries WHERE target_id = $1 AND action = 'ENROLLMENT_TOGGLED'",
        [group.id],
      );
      expect(auditRows).toHaveLength(0);
    });

    it('keeps enrollment_status and the audit trail consistent when the toggle and the archival are fired together', async () => {
      const admin = await registerAndLogin(
        'admin-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-race@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-race@test-toggle-enrollment.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص حالة التسجيل - سباق متزامن',
        teacher.userId,
        assistant.userId,
      );

      const [toggleRes, archiveRes] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/groups/${group.id}/enrollment`)
          .set('Authorization', `Bearer ${teacher.accessToken}`)
          .send({ enrollment_status: 'Open' }),
        request(app.getHttpServer())
          .patch(`/api/v1/groups/${group.id}/lifecycle`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ lifecycle_state: 'Archived' }),
      ]);

      // Either interleaving is legal, and neither is an error: the archival
      // always wins the lifecycle, and the toggle is either an ordinary
      // success or the BR-42 no-op.
      expect(toggleRes.status).toBe(HttpStatus.OK);
      expect(archiveRes.status).toBe(HttpStatus.OK);

      const rows: Array<{
        enrollment_status: string;
        lifecycle_state: string;
      }> = await dataSource.query(
        'SELECT enrollment_status, lifecycle_state FROM groups WHERE id = $1',
        [group.id],
      );
      expect(rows[0].lifecycle_state).toBe('Archived');

      const auditRows: Array<{ id: string }> = await dataSource.query(
        "SELECT id FROM audit_entries WHERE target_id = $1 AND action = 'ENROLLMENT_TOGGLED'",
        [group.id],
      );

      // The invariant that must hold in every interleaving: an audit row exists
      // if and only if the toggle actually landed while the group was Active.
      // A stale 'Open' with no audit row — or an audit row with the toggle
      // never applied — is the BR-42 violation this guards.
      expect(auditRows).toHaveLength(
        rows[0].enrollment_status === 'Open' ? 1 : 0,
      );
    });
  });

  // 6. Validation errors -> 422
  describe('Validation', () => {
    it('returns 422 when enrollment_status is invalid value', async () => {
      const teacher = await registerAndLogin(
        'teacher-val@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'INVALID_STATUS' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('returns 422 when enrollment_status is missing', async () => {
      const teacher = await registerAndLogin(
        'teacher-val2@test-toggle-enrollment.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({})
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  // 7. Role-based authorization tests (parameterized per TS.md)
  describe('Role-based authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Admin', async () => {
      const admin = await registerAndLogin(
        'admin-auth-toggle@test-toggle-enrollment.com',
        UserRole.Admin,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth-toggle@test-toggle-enrollment.com',
        UserRole.Assistant,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth-toggle@test-toggle-enrollment.com',
        UserRole.Student,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth-toggle@test-toggle-enrollment.com',
        UserRole.User,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/enrollment`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
