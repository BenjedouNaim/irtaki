import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthTokenTypeOrmEntity } from './auth-token.typeorm-entity';

type AuthTokenPurpose = AuthTokenTypeOrmEntity['purpose'];

/**
 * TypeORM's Postgres driver hands an `UPDATE … RETURNING` back as
 * `[rows, affectedCount]` (unlike `INSERT … RETURNING`, which yields the
 * rows directly). Normalises either shape to the returned rows.
 */
function returnedRows<T>(raw: unknown): T[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  if (raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
    return raw[0] as T[];
  }
  return raw as T[];
}

/**
 * `auth_tokens` (SA §13) persistence for the revocation write paths of
 * API-003 / API-004 / API-006. Minting stays in `TokenService`; this class
 * owns every read and write that decides whether a token is still live.
 *
 * The table carries no unique index, so nothing behind these statements would
 * catch a lost update. Every state transition here is therefore expressed as a
 * single conditional `UPDATE … WHERE revoked_at IS NULL`, per TS §20: the
 * predicate is the guard, 0 rows affected means a concurrent caller got there
 * first, and the caller maps that to the documented already-used error. No row
 * locking and no elevated isolation — default `READ COMMITTED` is sufficient
 * because the decision and the write are one statement.
 */
@Injectable()
export class AuthTokenRepository {
  constructor(
    @InjectRepository(AuthTokenTypeOrmEntity)
    private readonly tokenRepo: Repository<AuthTokenTypeOrmEntity>,
  ) {}

  async findByHash(
    tokenHash: string,
    purpose: AuthTokenPurpose,
  ): Promise<AuthTokenTypeOrmEntity | null> {
    return this.tokenRepo.findOne({ where: { tokenHash, purpose } });
  }

  async findById(id: string): Promise<AuthTokenTypeOrmEntity | null> {
    return this.tokenRepo.findOne({ where: { id } });
  }

  /**
   * API-003's rotation step: revoke the presented token and link it to its
   * replacement in one guarded statement.
   *
   * Returns `false` when the row was already revoked — a concurrent refresh of
   * the same token won the race. The caller must treat that as reuse (SA §13)
   * rather than retrying: the guard is what stops the second rotation from
   * overwriting `replaced_by` and orphaning the winner's branch off the chain
   * the reuse-detection walk follows.
   *
   * Expiry is deliberately *not* folded into the predicate here — API-003
   * answers an expired token with `REFRESH_TOKEN_EXPIRED` and a revoked one
   * with `REFRESH_TOKEN_REUSED`, so 0 rows has to mean "revoked" and nothing
   * else. Expiry stays the separate check it already was; it is monotonic, so
   * it cannot race.
   */
  async rotateConditionally(
    id: string,
    revokedAt: Date,
    replacedBy: string,
  ): Promise<boolean> {
    const raw: unknown = await this.tokenRepo.query(
      `UPDATE auth_tokens
       SET revoked_at = $2,
           replaced_by = $3
       WHERE id = $1
         AND revoked_at IS NULL
       RETURNING id`,
      [id, revokedAt, replacedBy],
    );

    return returnedRows<{ id: string }>(raw).length > 0;
  }

  /**
   * Single-use consumption for API-004 (logout) and API-006 (password reset
   * confirm). Returns `false` when the token was already revoked *or* already
   * expired — both endpoints answer those two cases with the same documented
   * error (`INVALID_REFRESH_TOKEN`, `INVALID_OR_EXPIRED_TOKEN`), so folding
   * expiry into the predicate costs the caller no precision and leaves one
   * statement authoritative over the whole decision.
   */
  async revokeConditionally(id: string, revokedAt: Date): Promise<boolean> {
    const raw: unknown = await this.tokenRepo.query(
      `UPDATE auth_tokens
       SET revoked_at = $2
       WHERE id = $1
         AND revoked_at IS NULL
         AND expires_at > $2
       RETURNING id`,
      [id, revokedAt],
    );

    return returnedRows<{ id: string }>(raw).length > 0;
  }

  /**
   * Revoke a token whose liveness the caller has no reason to defend: the
   * descendants walked by SA §13's reuse detection, and the pair a refresh
   * minted just before losing the rotation race. Still guarded on
   * `revoked_at IS NULL` so an already-revoked row keeps its original
   * timestamp rather than having it moved forward.
   */
  async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.tokenRepo.update({ id, revokedAt: IsNull() }, { revokedAt });
  }

  /**
   * API-006's documented side effect: completing a password reset ends every
   * outstanding session for that user (SA §13).
   */
  async revokeAllRefreshTokensForUser(
    userId: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.tokenRepo.update(
      { userId, purpose: 'refresh', revokedAt: IsNull() },
      { revokedAt },
    );
  }
}
