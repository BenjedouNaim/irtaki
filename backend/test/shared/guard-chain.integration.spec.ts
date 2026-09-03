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
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { LoginResponseDto } from '../../src/modules/identity/application/login/login-response.dto';
import { MeResponseDto } from '../../src/modules/identity/application/me/me-response.dto';
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('Global Guard Chain (AuthGuard -> RolesGuard -> ScopeGuard)', () => {
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
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query(
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-guard-chain.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-guard-chain.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-guard-chain.com'",
      );
    }
    await app.close();
  });

  describe('Public Routes Bypass (@Public())', () => {
    it('allows access to POST /api/v1/auth/register without an Authorization header', async () => {
      const email = `guard-public-reg-${Date.now()}@test-guard-chain.com`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'Password123!',
          timezone: 'Africa/Tunis',
        })
        .expect(HttpStatus.CREATED);

      const body = res.body as RegisterResponseDto;
      expect(body.id).toBeDefined();
      expect(body.email).toBe(email);
    });

    it('allows access to POST /api/v1/auth/login without an Authorization header', async () => {
      const email = `guard-public-log-${Date.now()}@test-guard-chain.com`;

      // First register
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'Password123!',
          timezone: 'Africa/Tunis',
        })
        .expect(HttpStatus.CREATED);

      // Now login without Authorization header
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);

      const body = res.body as LoginResponseDto;
      expect(body.access_token).toBeDefined();
      expect(body.refresh_token).toBeDefined();
    });
  });

  describe('Protected Routes (GET /api/v1/me)', () => {
    it('returns 401 when Authorization header is missing (AuthGuard rejects first)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .expect(HttpStatus.UNAUTHORIZED);

      const body = res.body as ErrorEnvelope;
      expect(body.statusCode).toBe(401);
      expect(body.error).toBe('TOKEN_EXPIRED');
    });

    it('returns 200 when authenticated user accesses GET /api/v1/me (passes AuthGuard, RolesGuard, ScopeGuard)', async () => {
      const email = `guard-me-${Date.now()}@test-guard-chain.com`;

      const regRes = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: 'Password123!',
          timezone: 'Africa/Tunis',
        })
        .expect(HttpStatus.CREATED);

      const regBody = regRes.body as RegisterResponseDto;

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'Password123!',
        })
        .expect(HttpStatus.OK);

      const loginBody = loginRes.body as LoginResponseDto;

      const res = await request(app.getHttpServer())
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${loginBody.access_token}`)
        .expect(HttpStatus.OK);

      const body = res.body as MeResponseDto;
      expect(body.id).toBe(regBody.id);
      expect(body.email).toBe(email);
    });
  });
});
