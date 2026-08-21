import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { RefreshResponseDto } from '../../src/modules/identity/application/refresh/refresh-response.dto';

interface DbAuthTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: string;
  revoked_at: Date | null;
  replaced_by: string | null;
  expires_at: Date;
}

describe('POST /auth/refresh (API-003 Integration)', () => {
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
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-refresh.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-refresh.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-refresh.com'",
      );
    }
    await app.close();
  });

  beforeEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-refresh.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-refresh.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-refresh.com'",
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

  it('rotates refresh token and returns new token pair (200 OK)', async () => {
    const registered = await registerTestUser('valid@test-refresh.com');
    const initialRefreshToken = registered.refresh_token;

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refresh_token: initialRefreshToken,
      });

    expect(response.status).toBe(HttpStatus.OK);
    const body = response.body as RefreshResponseDto;
    expect(body.access_token).toBeDefined();
    expect(typeof body.access_token).toBe('string');
    expect(body.refresh_token).toBeDefined();
    expect(typeof body.refresh_token).toBe('string');
    expect(body.refresh_token).not.toBe(initialRefreshToken);

    // Verify old token is marked revoked and points to new token in database
    const oldTokens: DbAuthTokenRow[] = await dataSource.query(
      'SELECT * FROM auth_tokens WHERE user_id = $1 AND revoked_at IS NOT NULL',
      [registered.id],
    );
    expect(oldTokens).toHaveLength(1);
    expect(oldTokens[0].replaced_by).toBeDefined();

    const newTokens: DbAuthTokenRow[] = await dataSource.query(
      'SELECT * FROM auth_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [registered.id],
    );
    expect(newTokens).toHaveLength(1);
    expect(oldTokens[0].replaced_by).toBe(newTokens[0].id);
  });

  it('rejects expired refresh token with 401 REFRESH_TOKEN_EXPIRED', async () => {
    const registered = await registerTestUser('expired@test-refresh.com');

    // Manually expire the token in database
    await dataSource.query(
      'UPDATE auth_tokens SET expires_at = $1 WHERE user_id = $2',
      [new Date(Date.now() - 1000 * 60 * 60), registered.id],
    );

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refresh_token: registered.refresh_token,
      });

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    const body = response.body as ErrorEnvelope;
    expect(body.error).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('detects token reuse and revokes entire token chain (SA §13 reuse detection)', async () => {
    const registered = await registerTestUser('reuse@test-refresh.com');
    const firstRefreshToken = registered.refresh_token;

    // First rotation (valid)
    const rotate1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: firstRefreshToken });
    expect(rotate1.status).toBe(HttpStatus.OK);
    const secondRefreshToken = (rotate1.body as RefreshResponseDto)
      .refresh_token;

    // Second rotation (valid)
    const rotate2 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: secondRefreshToken });
    expect(rotate2.status).toBe(HttpStatus.OK);
    const thirdRefreshToken = (rotate2.body as RefreshResponseDto)
      .refresh_token;

    // Presenting the first (already revoked) token again -> REUSE DETECTED
    const reuseAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: firstRefreshToken });

    expect(reuseAttempt.status).toBe(HttpStatus.UNAUTHORIZED);
    const body = reuseAttempt.body as ErrorEnvelope;
    expect(body.error).toBe('REFRESH_TOKEN_REUSED');

    // Verify third token (descendant in chain) was revoked by reuse detection
    const activeTokens: DbAuthTokenRow[] = await dataSource.query(
      'SELECT * FROM auth_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [registered.id],
    );
    expect(activeTokens).toHaveLength(0);

    // Attempting to refresh with third token now fails as well
    const thirdAttempt = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: thirdRefreshToken });
    expect(thirdAttempt.status).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('rejects unknown / random refresh token with 401 INVALID_REFRESH_TOKEN', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({
        refresh_token:
          'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      });

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    const body = response.body as ErrorEnvelope;
    expect(body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects empty refresh_token with 422 Unprocessable Entity', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({});

    expect(response.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});
