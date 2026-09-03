import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
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
import { AuditAction } from '../../src/modules/administration/domain/audit-action.enum';
import {
  AuditEntryDto,
  GetAuditLogResponseDto,
} from '../../src/modules/administration/application/get-audit-log/audit-entry.dto';
import {
  purgeAuditEntries,
  purgeNotificationLog,
  stopScheduledJobs,
} from '../shared/scheduled-jobs';

type AuditLogBody = GetAuditLogResponseDto;

const EMAIL_SUFFIX = '@test-audit-log.com';

/**
 * F-ADM-03 / API-054. Entries are seeded directly into `audit_entries` —
 * this endpoint has no write path of its own (APIS §9.9 puts the three
 * writes in Identity and Groups), so the read is exercised against rows in
 * the shape those writers produce. `occurred_at` values are far-future so
 * the seeded rows are deterministically the newest in the table whatever
 * else the suite left behind.
 */
describe('GET /audit (API-054 Integration)', () => {
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
    // Wholesale, not scoped to this file's fixtures: SAS §21 audits login,
    // so LOGIN rows written by every other suite (and by the seeded Admin,
    // whose email matches no suffix) accumulate across runs until the
    // "walk to the last page" test below cannot reach the end of the log.
    await purgeAuditEntries(dataSource);
    await dataSource.query(
      `DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%${EMAIL_SUFFIX}')`,
    );
    await dataSource.query(
      `DELETE FROM users WHERE email LIKE '%${EMAIL_SUFFIX}'`,
    );
  }

  async function registerAndLogin(
    email: string,
    role: UserRole = UserRole.User,
    fullName: string | null = null,
  ): Promise<{ accessToken: string; userId: string }> {
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
        return { accessToken: loginBody.access_token, userId: adminId };
      }
    }

    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const regBody = regRes.body as RegisterResponseDto;
    const userId = regBody.id;

    if (role !== UserRole.User || fullName !== null) {
      await dataSource.query(
        `UPDATE users SET role = $1, full_name = $2 WHERE id = $3`,
        [role, fullName, userId],
      );
    }

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(HttpStatus.OK);

    const loginBody = loginRes.body as LoginResponseDto;
    return { accessToken: loginBody.access_token, userId };
  }

  async function seedEntry(entry: {
    id: string;
    actorId: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    occurredAt: string;
  }): Promise<void> {
    await dataSource.query(
      `INSERT INTO audit_entries (id, actor_id, action, target_type, target_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.id,
        entry.actorId,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.occurredAt,
      ],
    );
  }

  const TARGET_GROUP = '0193f000-0000-7000-8000-0000000000aa';

  /** Newest last — reversed below into the order the endpoint must return. */
  const SEEDED = [
    {
      id: '0193f000-0000-7000-8000-000000000001',
      action: AuditAction.Login,
      targetType: null,
      targetId: null,
      occurredAt: '2099-01-01T06:58:00.000000Z',
    },
    {
      id: '0193f000-0000-7000-8000-000000000002',
      action: AuditAction.EnrollmentToggled,
      targetType: 'Group',
      targetId: TARGET_GROUP,
      occurredAt: '2099-01-01T21:10:00.000000Z',
    },
    {
      id: '0193f000-0000-7000-8000-000000000003',
      action: AuditAction.Login,
      targetType: null,
      targetId: null,
      occurredAt: '2099-01-02T18:02:00.000000Z',
    },
    {
      id: '0193f000-0000-7000-8000-000000000004',
      action: AuditAction.GroupCreated,
      targetType: 'Group',
      targetId: TARGET_GROUP,
      occurredAt: '2099-01-02T19:30:00.000000Z',
    },
    {
      id: '0193f000-0000-7000-8000-000000000005',
      action: AuditAction.EnrollmentToggled,
      targetType: 'Group',
      targetId: TARGET_GROUP,
      occurredAt: '2099-01-03T08:12:00.000000Z',
    },
  ] as const;

  /** The one action the schema admits but APIS §9.9 never exposes. */
  const UNEXPOSED_ENTRY_ID = '0193f000-0000-7000-8000-0000000000ff';

  let adminToken: string;
  let actorId: string;
  /** `occurred_at DESC` — the exact order `GET /audit` must return. */
  let expectedOrder: string[];

  async function fetchPage(query = ''): Promise<AuditLogBody> {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/audit${query}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(HttpStatus.OK);
    return res.body as AuditLogBody;
  }

  /** Only the rows this suite seeded — the table is shared with other specs. */
  function seededOnly(rows: AuditEntryDto[]): AuditEntryDto[] {
    const ids = new Set<string>(SEEDED.map((e) => e.id));
    return rows.filter((row) => ids.has(row.id));
  }

  beforeAll(async () => {
    const admin = await registerAndLogin(
      `admin${EMAIL_SUFFIX}`,
      UserRole.Admin,
    );
    adminToken = admin.accessToken;

    const actor = await registerAndLogin(
      `actor${EMAIL_SUFFIX}`,
      UserRole.Teacher,
      'الشيخ عبد الرحمن',
    );
    actorId = actor.userId;

    for (const entry of SEEDED) {
      await seedEntry({ ...entry, actorId });
    }
    expectedOrder = [...SEEDED].map((e) => e.id).reverse();

    // A `STAFF_REASSIGNED` row exists in the schema's CHECK list but is not
    // one of the three actions APIS §9.9 exposes — it must never surface.
    await seedEntry({
      id: UNEXPOSED_ENTRY_ID,
      actorId,
      action: 'STAFF_REASSIGNED',
      targetType: 'Group',
      targetId: TARGET_GROUP,
      occurredAt: '2099-01-04T09:00:00.000000Z',
    });
  });

  describe('Response contract (APIS §10.13)', () => {
    it('returns the documented item shape with the actor reference object', async () => {
      const body = await fetchPage('?limit=100');
      const entry = seededOnly(body.data).find(
        (row) => row.id === '0193f000-0000-7000-8000-000000000005',
      );

      expect(entry).toBeDefined();
      expect(Object.keys(entry!).sort()).toEqual([
        'action',
        'actor',
        'id',
        'occurred_at',
        'target_id',
        'target_type',
      ]);
      expect(entry!.actor).toEqual({
        id: actorId,
        full_name: 'الشيخ عبد الرحمن',
      });
      expect(entry!.action).toBe(AuditAction.EnrollmentToggled);
      expect(entry!.target_type).toBe('Group');
      expect(entry!.target_id).toBe(TARGET_GROUP);
      expect(entry!.occurred_at).toBe('2099-01-03T08:12:00.000Z');
    });

    it('keeps target_type and target_id null on a LOGIN entry (DEC-B04)', async () => {
      const body = await fetchPage(`?action=${AuditAction.Login}&limit=100`);
      const entry = seededOnly(body.data).find(
        (row) => row.id === '0193f000-0000-7000-8000-000000000001',
      );

      expect(entry).toBeDefined();
      expect(entry!.target_type).toBeNull();
      expect(entry!.target_id).toBeNull();
    });

    it('returns the cursor block with no totals (APIS §9.1)', async () => {
      const body = await fetchPage('?limit=100');

      expect(Object.keys(body.pagination).sort()).toEqual([
        'has_more',
        'next_cursor',
      ]);
      expect(body).not.toHaveProperty('total');
    });
  });

  describe('Only the three audited actions ever appear (APIS §9.9, RISK-08)', () => {
    it('never returns an entry whose action is outside the three', async () => {
      const body = await fetchPage('?limit=100');

      expect(body.data.some((row) => row.id === UNEXPOSED_ENTRY_ID)).toBe(
        false,
      );
      expect(
        body.data.every((row) =>
          [
            AuditAction.Login,
            AuditAction.GroupCreated,
            AuditAction.EnrollmentToggled,
          ].includes(row.action),
        ),
      ).toBe(true);
    });

    it('rejects an action filter outside the three with 422', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit?action=STAFF_REASSIGNED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      await request(app.getHttpServer())
        .get('/api/v1/audit?action=PAYMENT_RECORDED')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('Filter by action (APIS §9.3)', () => {
    it.each([
      [AuditAction.Login, 2],
      [AuditAction.GroupCreated, 1],
      [AuditAction.EnrollmentToggled, 2],
    ])('returns only %s entries', async (action, expectedCount) => {
      const body = await fetchPage(`?action=${action}&limit=100`);

      expect(body.data.every((row) => row.action === action)).toBe(true);
      expect(seededOnly(body.data)).toHaveLength(expectedCount);
    });
  });

  describe('Filter by date range (APIS §9.3)', () => {
    it('bounds the range inclusively on both ends', async () => {
      const body = await fetchPage('?from=2099-01-02&to=2099-01-02&limit=100');

      expect(seededOnly(body.data).map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000004',
        '0193f000-0000-7000-8000-000000000003',
      ]);
    });

    it('accepts `from` alone', async () => {
      const body = await fetchPage('?from=2099-01-03&limit=100');

      expect(seededOnly(body.data).map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000005',
      ]);
    });

    it('accepts `to` alone', async () => {
      const body = await fetchPage('?to=2099-01-01&limit=100');

      expect(seededOnly(body.data).map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000002',
        '0193f000-0000-7000-8000-000000000001',
      ]);
    });

    it('combines the action and date filters', async () => {
      const body = await fetchPage(
        `?action=${AuditAction.Login}&from=2099-01-02&to=2099-01-03&limit=100`,
      );

      expect(seededOnly(body.data).map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000003',
      ]);
    });

    it('returns an empty page for a range with no entries', async () => {
      const body = await fetchPage('?from=2098-01-01&to=2098-12-31&limit=100');

      expect(seededOnly(body.data)).toHaveLength(0);
    });

    it('rejects a malformed date with 422', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit?from=01-09-2099')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);

      await request(app.getHttpServer())
        .get('/api/v1/audit?to=not-a-date')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  describe('Cursor pagination (APIS §9.2)', () => {
    it('walks occurred_at DESC page by page with no row repeated or skipped', async () => {
      // The `STAFF_REASSIGNED` row is the newest of all and still absent
      // from the first page — the read is restricted before it is ordered.
      const first = await fetchPage('?limit=2');
      expect(first.data.map((row) => row.id)).toEqual([
        expectedOrder[0],
        expectedOrder[1],
      ]);
      expect(first.pagination.has_more).toBe(true);
      expect(typeof first.pagination.next_cursor).toBe('string');

      const second = await fetchPage(
        `?limit=2&cursor=${encodeURIComponent(first.pagination.next_cursor!)}`,
      );
      expect(second.data.map((row) => row.id)).toEqual([
        expectedOrder[2],
        expectedOrder[3],
      ]);

      const third = await fetchPage(
        `?limit=2&cursor=${encodeURIComponent(second.pagination.next_cursor!)}`,
      );
      expect(third.data[0].id).toBe(expectedOrder[4]);

      const walked = [...first.data, ...second.data, ...third.data];
      expect(new Set(walked.map((row) => row.id)).size).toBe(walked.length);
    });

    it('reaches a last page whose next_cursor is null', async () => {
      const seen: AuditEntryDto[] = [];
      let cursor: string | null = null;
      let pages = 0;

      do {
        const page: AuditLogBody = await fetchPage(
          cursor ? `?limit=3&cursor=${encodeURIComponent(cursor)}` : '?limit=3',
        );
        seen.push(...page.data);
        cursor = page.pagination.next_cursor;
        expect(page.pagination.has_more).toBe(cursor !== null);
        pages += 1;
      } while (cursor && pages < 50);

      expect(cursor).toBeNull();
      expect(new Set(seen.map((row) => row.id)).size).toBe(seen.length);
      for (const id of expectedOrder) {
        expect(seen.some((row) => row.id === id)).toBe(true);
      }
    });

    it('paginates a filtered read the same way', async () => {
      const first = await fetchPage(`?action=${AuditAction.Login}&limit=1`);
      expect(first.data.map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000003',
      ]);
      expect(first.pagination.has_more).toBe(true);

      const second = await fetchPage(
        `?action=${AuditAction.Login}&limit=1&cursor=${encodeURIComponent(
          first.pagination.next_cursor!,
        )}`,
      );
      expect(second.data.map((row) => row.id)).toEqual([
        '0193f000-0000-7000-8000-000000000001',
      ]);
    });

    it('clamps limit instead of rejecting it (APIS §9.2)', async () => {
      const tooSmall = await fetchPage('?limit=0');
      expect(tooSmall.data).toHaveLength(1);

      const tooLarge = await fetchPage('?limit=5000');
      expect(tooLarge.data.length).toBeLessThanOrEqual(100);
    });

    it('treats an unreadable cursor as the first page rather than a 422', async () => {
      const first = await fetchPage('?limit=2');
      const tampered = await fetchPage('?limit=2&cursor=not-a-real-cursor');

      expect(tampered.data.map((row) => row.id)).toEqual(
        first.data.map((row) => row.id),
      );
    });
  });

  describe('Authorization (APIS §8, SA §17)', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/audit')
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it.each([
      [UserRole.Teacher, `teacher${EMAIL_SUFFIX}`],
      [UserRole.Assistant, `assistant${EMAIL_SUFFIX}`],
      [UserRole.Student, `student${EMAIL_SUFFIX}`],
      [UserRole.User, `user${EMAIL_SUFFIX}`],
    ])('returns 403 Forbidden for %s', async (role, email) => {
      const caller = await registerAndLogin(email, role);

      await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${caller.accessToken}`)
        .expect(HttpStatus.FORBIDDEN);
    });
  });
});
