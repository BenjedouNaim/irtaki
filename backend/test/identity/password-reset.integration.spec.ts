/* eslint-disable @typescript-eslint/unbound-method */
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
import { ErrorEnvelope } from '../../src/shared/filters/http-exception.filter';
import { RegisterResponseDto } from '../../src/modules/identity/application/register/register-response.dto';
import { LoginResponseDto } from '../../src/modules/identity/application/login/login-response.dto';
import { stopScheduledJobs } from '../shared/scheduled-jobs';

describe('POST /auth/password-reset (API-005 & API-006 Integration)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  // In-memory capture for mock mailer
  const sentEmails: Array<{ email: string; resetToken: string }> = [];

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn(
      (email: string, resetToken: string): Promise<void> => {
        sentEmails.push({ email, resetToken });
        return Promise.resolve();
      },
    ),
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
        "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-pwreset.com')",
      );
      await dataSource.query(
        "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-pwreset.com')",
      );
      await dataSource.query(
        "DELETE FROM users WHERE email LIKE '%@test-pwreset.com'",
      );
    }
    await app.close();
  });

  beforeEach(() => {
    sentEmails.length = 0;
    jest.clearAllMocks();
  });

  it('executes valid end-to-end password reset flow and allows login with new password', async () => {
    const email = `valid-${Date.now()}@test-pwreset.com`;
    const oldPassword = 'OldValidPassword123!';
    const newPassword = 'NewStrongPassword123!';

    // 1. Register user
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: oldPassword, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    // 2. Request password reset
    const reqRes = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(HttpStatus.ACCEPTED);

    expect(reqRes.body).toHaveProperty('message');
    expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].email).toBe(email);
    const capturedToken = sentEmails[0].resetToken;
    expect(capturedToken).toBeDefined();

    // 3. Confirm password reset
    const confirmRes = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: capturedToken, new_password: newPassword })
      .expect(HttpStatus.OK);

    expect(confirmRes.body).toHaveProperty('message');

    // 4. Old password login must fail (401)
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword })
      .expect(HttpStatus.UNAUTHORIZED);

    // 5. New password login must succeed (200)
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(HttpStatus.OK);

    const loginBody = loginRes.body as LoginResponseDto;
    expect(loginBody.access_token).toBeDefined();
  });

  it('revokes all outstanding refresh sessions when password reset is confirmed (SA §13)', async () => {
    const email = `session-revoke-${Date.now()}@test-pwreset.com`;
    const oldPassword = 'OldValidPassword123!';
    const newPassword = 'NewStrongPassword123!';

    // 1. Register and get a session
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: oldPassword, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    const initialRefreshToken = (regRes.body as RegisterResponseDto)
      .refresh_token;

    // 2. Log in second device to get another active session
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: oldPassword })
      .expect(HttpStatus.OK);

    const secondRefreshToken = (loginRes.body as LoginResponseDto)
      .refresh_token;

    // 3. Request and confirm password reset
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(HttpStatus.ACCEPTED);

    const capturedToken = sentEmails[0].resetToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: capturedToken, new_password: newPassword })
      .expect(HttpStatus.OK);

    // 4. Both previous refresh tokens should now fail on refresh
    const refreshRes1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: initialRefreshToken })
      .expect(HttpStatus.UNAUTHORIZED);

    const refreshRes2 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: secondRefreshToken })
      .expect(HttpStatus.UNAUTHORIZED);

    expect((refreshRes1.body as ErrorEnvelope).error).toBeDefined();
    expect((refreshRes2.body as ErrorEnvelope).error).toBeDefined();
  });

  it('returns 202 with identical body on unknown email without sending email (anti-enumeration)', async () => {
    const unknownEmail = `nonexistent-${Date.now()}@test-pwreset.com`;

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email: unknownEmail })
      .expect(HttpStatus.ACCEPTED);

    expect(res.body).toEqual({
      message:
        'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    });
    expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_OR_EXPIRED_TOKEN when reset token has expired', async () => {
    const email = `expired-${Date.now()}@test-pwreset.com`;
    const password = 'OldValidPassword123!';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(HttpStatus.ACCEPTED);

    const capturedToken = sentEmails[0].resetToken;

    // Manually expire the token in DB
    await dataSource.query(
      "UPDATE auth_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE purpose = 'password_reset'",
    );

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: capturedToken, new_password: 'NewStrongPassword123!' })
      .expect(HttpStatus.BAD_REQUEST);

    const body = res.body as ErrorEnvelope;
    expect(body.error).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('returns 400 INVALID_OR_EXPIRED_TOKEN on second attempt (single-use enforcement)', async () => {
    const email = `single-use-${Date.now()}@test-pwreset.com`;
    const password = 'OldValidPassword123!';

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, timezone: 'Africa/Tunis' })
      .expect(HttpStatus.CREATED);

    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/request')
      .send({ email })
      .expect(HttpStatus.ACCEPTED);

    const capturedToken = sentEmails[0].resetToken;

    // First confirm succeeds
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: capturedToken, new_password: 'NewPassword123!' })
      .expect(HttpStatus.OK);

    // Second confirm with same token fails
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: capturedToken, new_password: 'AnotherPassword123!' })
      .expect(HttpStatus.BAD_REQUEST);

    const body = res.body as ErrorEnvelope;
    expect(body.error).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('returns 400 INVALID_OR_EXPIRED_TOKEN on unknown/malformed token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token: 'completely-unknown-token-12345678',
        new_password: 'NewPassword123!',
      })
      .expect(HttpStatus.BAD_REQUEST);

    const body = res.body as ErrorEnvelope;
    expect(body.error).toBe('INVALID_OR_EXPIRED_TOKEN');
  });

  it('returns 422 VALIDATION_ERROR on weak password (< 8 chars)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'some-token', new_password: 'short' })
      .expect(HttpStatus.UNPROCESSABLE_ENTITY);

    const body = res.body as ErrorEnvelope;
    expect(body.error).toBe('VALIDATION_ERROR');
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'new_password' }),
      ]),
    );
  });
});
