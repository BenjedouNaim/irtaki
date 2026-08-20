import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { LoginResponseDto } from '../../src/modules/identity/application/login/login-response.dto';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';

interface DbAuthTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: string;
}

interface DbAuditRow {
  id: string;
  action: string;
  actor_id: string;
}

describe('POST /auth/login (API-002 Integration)', () => {
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
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-login.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-login.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-login.com'",
      );
    }
    await app.close();
  });

  it('successfully authenticates with valid credentials and returns 200 with tokens and dashboard_route', async () => {
    const email = `valid-${Date.now()}@test-login.com`;
    const password = 'ValidPassword123!';

    // Register user first
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password,
        timezone: 'Africa/Tunis',
      })
      .expect(HttpStatus.CREATED);

    const registered = regRes.body as RegisterResponseDto;

    // Perform login
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(HttpStatus.OK);

    const body = res.body as LoginResponseDto & Record<string, unknown>;
    expect(body).toMatchObject({
      id: registered.id,
      role: 'User',
      timezone: 'Africa/Tunis',
      dashboard_route: 'user',
    });
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.password_hash).toBeUndefined();
    expect(body.password).toBeUndefined();
    expect(body.email).toBeUndefined();

    // Verify refresh token stored in auth_tokens table
    const dbTokens = await dataSource.query<DbAuthTokenRow[]>(
      "SELECT id, user_id, token_hash, purpose FROM auth_tokens WHERE user_id = $1 AND purpose = 'refresh'",
      [registered.id],
    );
    expect(dbTokens.length).toBeGreaterThanOrEqual(2); // One from register, one from login

    // Verify AuditEntry(LOGIN) side-effect written
    const auditLogs = await dataSource.query<DbAuditRow[]>(
      "SELECT id, action, actor_id FROM audit_entries WHERE actor_id = $1 AND action = 'LOGIN'",
      [registered.id],
    );
    expect(auditLogs.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects wrong password with 401 INVALID_CREDENTIALS', async () => {
    const email = `wrongpw-${Date.now()}@test-login.com`;
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'CorrectPassword123!',
      })
      .expect(HttpStatus.CREATED);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email,
        password: 'IncorrectPassword123!',
      })
      .expect(HttpStatus.UNAUTHORIZED);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(body.error).toBe('INVALID_CREDENTIALS');
    expect(body.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('rejects unknown email with 401 INVALID_CREDENTIALS (anti-enumeration identical to wrong password)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `nonexistent-${Date.now()}@test-login.com`,
        password: 'SomePassword123!',
      })
      .expect(HttpStatus.UNAUTHORIZED);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(body.error).toBe('INVALID_CREDENTIALS');
    expect(body.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('rejects missing password with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: `valid-${Date.now()}@test-login.com`,
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })]),
    );
  });

  it('rejects missing email with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        password: 'Password123!',
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('rejects invalid email format with 422 Unprocessable Entity', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: 'invalid-email-format',
        password: 'Password123!',
      })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it.todo(
    'rate limits /auth/login (429 RATE_LIMITED) when limits are configured',
  );
});
