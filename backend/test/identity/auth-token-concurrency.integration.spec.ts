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

interface DbAuthTokenRow {
  id: string;
  revoked_at: Date | null;
  replaced_by: string | null;
}

/**
 * TS §20's TOCTOU discipline on the three `auth_tokens` write paths.
 *
 * `auth_tokens` carries no unique index, so a duplicate write is caught only
 * by the `WHERE … revoked_at IS NULL` predicate each of these endpoints now
 * guards its UPDATE with. Every case here fires the competing requests with
 * `Promise.all` and asserts exactly one of them takes the token.
 */
describe('auth_tokens revocation concurrency (TS §20)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const sentEmails: Array<{ email: string; resetToken: string }> = [];

  const mockMailer: IMailer = {
    sendPasswordResetEmail: jest.fn(
      (email: string, resetToken: string): Promise<void> => {
        sentEmails.push({ email, resetToken });
        return Promise.resolve();
      },
    ),
  };

  const cleanup = async (): Promise<void> => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(
      "DELETE FROM audit_entries WHERE actor_id IN (SELECT id FROM users WHERE email LIKE '%@test-tokenrace.com')",
    );
    await dataSource.query(
      "DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-tokenrace.com')",
    );
    await dataSource.query(
      "DELETE FROM users WHERE email LIKE '%@test-tokenrace.com'",
    );
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
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(() => {
    sentEmails.length = 0;
    jest.clearAllMocks();
  });

  async function registerTestUser(
    email: string,
    password = 'Password123!',
  ): Promise<RegisterResponseDto> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password })
      .expect(HttpStatus.CREATED);
    return res.body as RegisterResponseDto;
  }

  async function tokenRowsFor(userId: string): Promise<DbAuthTokenRow[]> {
    return dataSource.query<DbAuthTokenRow[]>(
      'SELECT id, revoked_at, replaced_by FROM auth_tokens WHERE user_id = $1',
      [userId],
    );
  }

  describe('POST /auth/refresh (API-003)', () => {
    it('rotates exactly once when two refreshes present the same token at the same instant', async () => {
      const registered = await registerTestUser('refresh@test-tokenrace.com');

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refresh_token: registered.refresh_token }),
        request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refresh_token: registered.refresh_token }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.UNAUTHORIZED]);

      const rejected =
        res1.status === Number(HttpStatus.UNAUTHORIZED) ? res1 : res2;
      expect((rejected.body as ErrorEnvelope).error).toBe(
        'REFRESH_TOKEN_REUSED',
      );

      const rows = await tokenRowsFor(registered.id);

      // Exactly one rotation link exists. Before the guard, both requests
      // rotated and the second `save` overwrote `replaced_by`, orphaning the
      // first branch off the chain the reuse-detection walk follows.
      const rotated = rows.filter((r) => r.replaced_by !== null);
      expect(rotated).toHaveLength(1);

      // A token presented twice is a theft signal (SA §13), so the winner's
      // branch goes down with it — including the pair the loser had already
      // minted before it lost the race. Nothing may be left live.
      const live = rows.filter((r) => r.revoked_at === null);
      expect(live).toHaveLength(0);
    });

    it('leaves a single sequential refresh untouched by the guard', async () => {
      const registered = await registerTestUser('solo@test-tokenrace.com');

      const rotate = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refresh_token: registered.refresh_token });

      expect(rotate.status).toBe(HttpStatus.OK);

      const rows = await tokenRowsFor(registered.id);
      expect(rows.filter((r) => r.revoked_at === null)).toHaveLength(1);
      expect(rows.filter((r) => r.replaced_by !== null)).toHaveLength(1);
    });
  });

  describe('POST /auth/password-reset/confirm (API-006)', () => {
    it('lets exactly one of two concurrent replays of a reset token set a password', async () => {
      const email = 'reset@test-tokenrace.com';
      const oldPassword = 'OldValidPassword123!';
      const firstPassword = 'FirstNewPassword123!';
      const secondPassword = 'SecondNewPassword123!';

      await registerTestUser(email, oldPassword);

      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset/request')
        .send({ email })
        .expect(HttpStatus.ACCEPTED);

      expect(sentEmails).toHaveLength(1);
      const resetToken = sentEmails[0].resetToken;

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token: resetToken, new_password: firstPassword }),
        request(app.getHttpServer())
          .post('/api/v1/auth/password-reset/confirm')
          .send({ token: resetToken, new_password: secondPassword }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([HttpStatus.OK, HttpStatus.BAD_REQUEST]);

      const rejected =
        res1.status === Number(HttpStatus.BAD_REQUEST) ? res1 : res2;
      expect((rejected.body as ErrorEnvelope).error).toBe(
        'INVALID_OR_EXPIRED_TOKEN',
      );

      // The winner's password is the one that stuck: the loser never reached
      // the write, so it cannot have overwritten it.
      const winnerPassword =
        res1.status === Number(HttpStatus.OK) ? firstPassword : secondPassword;
      const loserPassword =
        res1.status === Number(HttpStatus.OK) ? secondPassword : firstPassword;

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: winnerPassword })
        .expect(HttpStatus.OK);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: loserPassword })
        .expect(HttpStatus.UNAUTHORIZED);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: oldPassword })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /auth/logout (API-004)', () => {
    it('accepts exactly one of two concurrent logouts of the same token', async () => {
      const registered = await registerTestUser('logout@test-tokenrace.com');

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${registered.access_token}`)
          .send({ refresh_token: registered.refresh_token }),
        request(app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${registered.access_token}`)
          .send({ refresh_token: registered.refresh_token }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([
        HttpStatus.NO_CONTENT,
        HttpStatus.UNAUTHORIZED,
      ]);

      const rejected =
        res1.status === Number(HttpStatus.UNAUTHORIZED) ? res1 : res2;
      expect((rejected.body as ErrorEnvelope).error).toBe(
        'INVALID_REFRESH_TOKEN',
      );

      const rows = await tokenRowsFor(registered.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].revoked_at).not.toBeNull();
    });
  });
});
