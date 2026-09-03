import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

interface DbAuthTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: string;
  revoked_at: Date | null;
}

describe('POST /auth/logout (API-004 Integration)', () => {
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
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-logout.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-logout.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-logout.com'",
      );
    }
    await app.close();
  });

  beforeEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-logout.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-logout.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-logout.com'",
      );
    }
  });

  async function registerTestUser(email: string): Promise<RegisterResponseDto> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        password: 'Password123!',
      })
      .expect(HttpStatus.CREATED);
    return res.body as RegisterResponseDto;
  }

  it('revokes refresh token and returns 204 No Content when authenticated', async () => {
    const registered = await registerTestUser('valid@test-logout.com');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${registered.access_token}`)
      .send({
        refresh_token: registered.refresh_token,
      });

    expect(response.status).toBe(HttpStatus.NO_CONTENT);

    // Verify token is revoked in DB
    const tokens: DbAuthTokenRow[] = await dataSource.query(
      'SELECT * FROM auth_tokens WHERE user_id = $1',
      [registered.id],
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0].revoked_at).not.toBeNull();

    // Subsequent refresh attempt must fail
    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refresh_token: registered.refresh_token,
      });
    expect(refreshRes.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects logout attempt without Authorization header with 401', async () => {
    const registered = await registerTestUser('unauth@test-logout.com');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({
        refresh_token: registered.refresh_token,
      });

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects logout with unknown refresh token with 401', async () => {
    const registered = await registerTestUser('unknown@test-logout.com');

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${registered.access_token}`)
      .send({
        refresh_token:
          'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    const body = response.body as ErrorEnvelope;
    expect(body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects logout when token is already revoked with 401', async () => {
    const registered = await registerTestUser('alreadyrevoked@test-logout.com');

    // First logout
    const res1 = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${registered.access_token}`)
      .send({
        refresh_token: registered.refresh_token,
      });
    expect(res1.status).toBe(HttpStatus.NO_CONTENT);

    // Second logout with same token
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${registered.access_token}`)
      .send({
        refresh_token: registered.refresh_token,
      });
    expect(res2.status).toBe(HttpStatus.UNAUTHORIZED);
  });
});
