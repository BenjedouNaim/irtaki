import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { GroupArchivedEvent } from '../../src/modules/groups/domain/events/group-archived.event';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('PATCH /groups/:id/lifecycle (API-017 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let eventEmitter: EventEmitter2;

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
    eventEmitter = app.get(EventEmitter2);

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
      "DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR group_id IN (SELECT id FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com'))",
    );
    await dataSource.query(
      "DELETE FROM groups WHERE teacher_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR assistant_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR created_by IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com') OR name LIKE '%حلقة فحص الأرشفة%'",
    );
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-archive-group.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-archive-group.com'",
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

  // 1. Valid Archive by Admin
  describe('Valid Archive by Admin', () => {
    it('archives an Active group, sets archived_at, emits event, and writes NO audit entry (DEC-D05)', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-1@test-archive-group.com',
        UserRole.Teacher,
        'الشيخ عبد الله',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-arc-1@test-archive-group.com',
        UserRole.Assistant,
        'الأستاذ إبراهيم',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - أرشفة بنجاح',
        teacher.userId,
        assistant.userId,
      );

      expect(group.lifecycle_state).toBe('Active');

      // Set up event listener spy
      const emittedEvents: GroupArchivedEvent[] = [];
      const listener = (event: GroupArchivedEvent) => {
        emittedEvents.push(event);
      };
      eventEmitter.on(GroupArchivedEvent.EVENT_NAME, listener);

      try {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/groups/${group.id}/lifecycle`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ lifecycle_state: 'Archived' })
          .expect(HttpStatus.OK);

        const body = res.body as { data: GroupListItemDto };
        expect(body.data.id).toBe(group.id);
        expect(body.data.lifecycle_state).toBe('Archived');
        expect(body.data.name).toBe(group.name);

        // Verify DB state and archived_at
        const rows: Array<{
          lifecycle_state: string;
          archived_at: Date | null;
        }> = await dataSource.query(
          'SELECT lifecycle_state, archived_at FROM groups WHERE id = $1',
          [group.id],
        );
        expect(rows[0].lifecycle_state).toBe('Archived');
        expect(rows[0].archived_at).not.toBeNull();

        // Verify event was emitted
        expect(emittedEvents.length).toBe(1);
        expect(emittedEvents[0].groupId).toBe(group.id);
        expect(emittedEvents[0].archivedAt).toBeDefined();

        // Verify DEC-D05: NO audit entry written
        const auditRows: Array<{ id: string }> = await dataSource.query(
          "SELECT id FROM audit_entries WHERE target_id = $1 AND action NOT IN ('GROUP_CREATED')",
          [group.id],
        );
        expect(auditRows.length).toBe(0);
      } finally {
        eventEmitter.removeListener(GroupArchivedEvent.EVENT_NAME, listener);
      }
    });
  });

  // 2. Valid Un-archive by Admin
  describe('Valid Un-archive by Admin', () => {
    it('un-archives an Archived group, clears archived_at to null, and emits NO un-archive event', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-2@test-archive-group.com',
        UserRole.Teacher,
        'الشيخ يوسف',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-arc-2@test-archive-group.com',
        UserRole.Assistant,
        'الأستاذ طارق',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - إلغاء أرشفة',
        teacher.userId,
        assistant.userId,
      );

      // Archive it first
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.OK);

      // Now un-archive it
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Active' })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.id).toBe(group.id);
      expect(body.data.lifecycle_state).toBe('Active');

      // Verify DB state and archived_at is null
      const rows: Array<{
        lifecycle_state: string;
        archived_at: Date | null;
      }> = await dataSource.query(
        'SELECT lifecycle_state, archived_at FROM groups WHERE id = $1',
        [group.id],
      );
      expect(rows[0].lifecycle_state).toBe('Active');
      expect(rows[0].archived_at).toBeNull();

      // Verify DEC-D05: NO audit entry written
      const auditRows: Array<{ id: string }> = await dataSource.query(
        "SELECT id FROM audit_entries WHERE target_id = $1 AND action NOT IN ('GROUP_CREATED')",
        [group.id],
      );
      expect(auditRows.length).toBe(0);
    });
  });

  // 3. No-op on already Archived group
  describe('Idempotent No-op (BR-42)', () => {
    it('returns 200 with unchanged state and emits NO duplicate event when archiving an already-Archived group', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-3@test-archive-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-arc-3@test-archive-group.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - لا تغيير أرشفة',
        teacher.userId,
        assistant.userId,
      );

      // Archive once
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.OK);

      // Listen for events during second archive
      const emittedEvents: GroupArchivedEvent[] = [];
      const listener = (event: GroupArchivedEvent) => {
        emittedEvents.push(event);
      };
      eventEmitter.on(GroupArchivedEvent.EVENT_NAME, listener);

      try {
        const res = await request(app.getHttpServer())
          .patch(`/api/v1/groups/${group.id}/lifecycle`)
          .set('Authorization', `Bearer ${admin.accessToken}`)
          .send({ lifecycle_state: 'Archived' })
          .expect(HttpStatus.OK);

        const body = res.body as { data: GroupListItemDto };
        expect(body.data.lifecycle_state).toBe('Archived');
        expect(emittedEvents.length).toBe(0); // NO duplicate event
      } finally {
        eventEmitter.removeListener(GroupArchivedEvent.EVENT_NAME, listener);
      }
    });

    it('returns 200 with unchanged state when un-archiving an already-Active group', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-4@test-archive-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-arc-4@test-archive-group.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - لا تغيير تنشيط',
        teacher.userId,
        assistant.userId,
      );

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Active' })
        .expect(HttpStatus.OK);

      const body = res.body as { data: GroupListItemDto };
      expect(body.data.lifecycle_state).toBe('Active');
    });
  });

  // 4. "Archived dominates" cross-checks
  describe('Archived Dominates Enforcement', () => {
    it('excludes an archived group with Open enrollment from GET /groups/available', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-5@test-archive-group.com',
        UserRole.Teacher,
        'الشيخ صابر',
        'Male',
      );
      const assistant = await registerAndLogin(
        'assistant-arc-5@test-archive-group.com',
        UserRole.Assistant,
        'الأستاذ فاروق',
        'Male',
      );
      const user = await registerAndLogin(
        'user-applicant@test-archive-group.com',
        UserRole.User,
        'متقدم للتسجيل',
        'Male',
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - إخفاء من المتاح',
        teacher.userId,
        assistant.userId,
        'Male',
      );

      // Open enrollment as teacher
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.OK);

      // Verify it is visible in available groups
      const beforeRes = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      const beforeList = (beforeRes.body as { data: GroupListItemDto[] }).data;
      expect(beforeList.some((g) => g.id === group.id)).toBe(true);

      // Archive the group as Admin
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.OK);

      // Verify it is NO LONGER visible in available groups (Archived dominates)
      const afterRes = await request(app.getHttpServer())
        .get('/api/v1/groups/available?gender=Male')
        .set('Authorization', `Bearer ${user.accessToken}`)
        .expect(HttpStatus.OK);

      const afterList = (afterRes.body as { data: GroupListItemDto[] }).data;
      expect(afterList.some((g) => g.id === group.id)).toBe(false);
    });

    it('cross-check: PATCH /groups/:id/enrollment on an archived group still no-ops (200, unchanged)', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const teacher = await registerAndLogin(
        'teacher-arc-6@test-archive-group.com',
        UserRole.Teacher,
      );
      const assistant = await registerAndLogin(
        'assistant-arc-6@test-archive-group.com',
        UserRole.Assistant,
      );

      const group = await createTestGroup(
        admin.accessToken,
        'حلقة فحص الأرشفة - تبديل التسجيل لمؤرشفة',
        teacher.userId,
        assistant.userId,
      );

      // Archive the group via endpoint
      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.OK);

      // Teacher attempts to toggle enrollment on archived group -> 200, no-op (BR-42)
      const toggleRes = await request(app.getHttpServer())
        .patch(`/api/v1/groups/${group.id}/enrollment`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ enrollment_status: 'Open' })
        .expect(HttpStatus.OK);

      const body = toggleRes.body as { data: GroupListItemDto };
      expect(body.data.enrollment_status).toBe('Closed');
      expect(body.data.lifecycle_state).toBe('Archived');
    });
  });

  // 5. Validation
  describe('Validation', () => {
    it('returns 422 when lifecycle_state is invalid value', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'INVALID_STATE' })
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('returns 422 when lifecycle_state is missing', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({})
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('returns 404 when group does not exist', async () => {
      const admin = await registerAndLogin(
        'admin-arc@test-archive-group.com',
        UserRole.Admin,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${admin.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  // 6. Authorization Matrix (positive + negative)
  describe('Authorization', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('returns 403 Forbidden for Teacher', async () => {
      const teacher = await registerAndLogin(
        'teacher-auth-arc@test-archive-group.com',
        UserRole.Teacher,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${teacher.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Assistant', async () => {
      const assistant = await registerAndLogin(
        'assistant-auth-arc@test-archive-group.com',
        UserRole.Assistant,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${assistant.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for Student', async () => {
      const student = await registerAndLogin(
        'student-auth-arc@test-archive-group.com',
        UserRole.Student,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${student.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.FORBIDDEN);
    });

    it('returns 403 Forbidden for User', async () => {
      const user = await registerAndLogin(
        'user-auth-arc@test-archive-group.com',
        UserRole.User,
      );
      const randomId = uuidv7();

      await request(app.getHttpServer())
        .patch(`/api/v1/groups/${randomId}/lifecycle`)
        .set('Authorization', `Bearer ${user.accessToken}`)
        .send({ lifecycle_state: 'Archived' })
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
