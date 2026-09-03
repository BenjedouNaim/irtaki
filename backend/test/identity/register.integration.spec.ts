import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface DbUserRow {
  id: string;
  email: string;
  role: string;
  timezone: string;
  password_hash: string;
}

interface DbAuditRow {
  id: string;
  action: string;
  actor_id: string;
}

describe('POST /auth/register (API-001 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-register.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-register.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-register.com'",
      );
    }
    await app.close();
  });

  it('successfully registers a new user with default role User and returns tokens (201)', async () => {
    const email = `valid-${Date.now()}@test-register.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'ValidPassword123!',
        timezone: 'Africa/Tunis',
      })
      .expect(HttpStatus.CREATED);

    const body = res.body as RegisterResponseDto & Record<string, unknown>;
    expect(body).toMatchObject({
      role: 'User',
      email: email.toLowerCase(),
      timezone: 'Africa/Tunis',
    });
    expect(body.id).toBeDefined();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.password_hash).toBeUndefined();
    expect(body.password).toBeUndefined();

    // Verify persisted in DB
    const dbUser = await dataSource.query<DbUserRow[]>(
      'SELECT id, email, role, timezone, password_hash FROM users WHERE id = $1',
      [body.id],
    );
    expect(dbUser).toHaveLength(1);
    expect(dbUser[0].role).toBe('User');
    expect(dbUser[0].password_hash).toMatch(/^\$argon2id\$/);

    // Verify AuditEntry(LOGIN) was written
    const auditLogs = await dataSource.query<DbAuditRow[]>(
      'SELECT id, action, actor_id FROM audit_entries WHERE actor_id = $1',
      [body.id],
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    expect(auditLogs[0].action).toBe('LOGIN');
  });

  it('defaults to center timezone when timezone is omitted', async () => {
    const email = `notz-${Date.now()}@test-register.com`;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'ValidPassword123!',
      })
      .expect(HttpStatus.CREATED);

    const body = res.body as RegisterResponseDto;
    expect(body.timezone).toBe('Africa/Tunis');
  });

  it('rejects duplicate email with 409 Conflict and error: EMAIL_TAKEN', async () => {
    const email = `duplicate-${Date.now()}@test-register.com`;

    // First registration
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'ValidPassword123!',
      })
      .expect(HttpStatus.CREATED);

    // Second registration with same email (case insensitive)
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: email.toUpperCase(),
        password: 'AnotherPassword123!',
      })
      .expect(HttpStatus.CONFLICT);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.CONFLICT);
    expect(body.error).toBe('EMAIL_TAKEN');
    expect(body.message).toBeDefined();
  });

  // TS §20 — the duplicate pre-check above is a fast path only. Two
  // registrations of the same address in flight together both clear it, so the
  // loser can only be stopped by DB-UQ-01. Before the constraint violation was
  // translated, that loser surfaced as a 500 instead of the documented 409.
  it('lets exactly one of two concurrent registrations of the same email win (409 EMAIL_TAKEN)', async () => {
    const email = `race-${Date.now()}@test-register.com`;

    const [res1, res2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'ValidPassword123!' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email, password: 'AnotherPassword123!' }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([HttpStatus.CREATED, HttpStatus.CONFLICT]);

    const loser = res1.status === Number(HttpStatus.CONFLICT) ? res1 : res2;
    const loserBody = loser.body as ErrorEnvelope;
    expect(loserBody.statusCode).toBe(HttpStatus.CONFLICT);
    expect(loserBody.error).toBe('EMAIL_TAKEN');
    expect(loserBody.message).toBeDefined();

    // The constraint name must never reach the caller (TS §21, §29).
    expect(JSON.stringify(loserBody)).not.toContain('DB-UQ-01');
    expect(JSON.stringify(loserBody)).not.toMatch(/unique constraint/i);

    const rows = await dataSource.query<DbUserRow[]>(
      'SELECT id FROM users WHERE email = $1',
      [email],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects weak password with < 8 chars with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `shortpw-${Date.now()}@test-register.com`,
        password: 'short',
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });

  it('rejects invalid email format with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'ValidPassword123!',
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });
});
