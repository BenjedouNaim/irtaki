import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { AuthTokenRepository } from '../../infrastructure/auth-token.repository';
import { TokenService } from '../token/token.service';
import { RefreshDto } from './refresh.dto';
import { RefreshResponseDto } from './refresh-response.dto';

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService,
    private readonly authTokenRepository: AuthTokenRepository,
  ) {}

  async execute(dto: RefreshDto): Promise<RefreshResponseDto> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refresh_token);

    const tokenEntity = await this.authTokenRepository.findByHash(
      tokenHash,
      'refresh',
    );

    if (!tokenEntity) {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'رمز التحديث غير صالح',
      });
    }

    // Reuse detection (SA §13): presenting an already revoked token revokes its entire replacement chain
    if (tokenEntity.revokedAt !== null) {
      await this.revokeReplacementChain(tokenEntity.replacedBy);
      throw this.reuseDetected();
    }

    // Expiration check
    if (tokenEntity.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException({
        error: 'REFRESH_TOKEN_EXPIRED',
        message: 'انتهت صلاحية رمز التحديث',
      });
    }

    const user = await this.userRepository.findById(tokenEntity.userId);
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'المستخدم غير موجود',
      });
    }

    // Generate new token pair. This has to precede the rotation write: the
    // `replaced_by` FK points at a row that must already exist.
    const newTokens = await this.tokenService.generateTokenPair(
      user,
      tokenEntity.deviceToken,
    );

    // Revoke old token and record rotation link, guarded on the token still
    // being live (TS §20). The check above is only a fast path — this is the
    // statement that actually decides, so two refreshes of one token cannot
    // both rotate it and leave the loser's branch orphaned off the chain.
    const rotated = await this.authTokenRepository.rotateConditionally(
      tokenEntity.id,
      new Date(),
      newTokens.tokenId,
    );

    if (!rotated) {
      // A concurrent refresh presented the same token and got there first,
      // which is the reuse signal SA §13 describes — arriving as a race rather
      // than as a replay, but indistinguishable from one, and answered the
      // same way. The pair minted a moment ago never reached the client and
      // must not stay live; the winner's chain is then revoked from the
      // `replaced_by` link the winner committed.
      await this.authTokenRepository.revoke(newTokens.tokenId, new Date());

      const rotatedByWinner = await this.authTokenRepository.findById(
        tokenEntity.id,
      );
      await this.revokeReplacementChain(rotatedByWinner?.replacedBy ?? null);

      throw this.reuseDetected();
    }

    return {
      access_token: newTokens.accessToken,
      refresh_token: newTokens.refreshToken,
    };
  }

  /**
   * Walks the `replaced_by` links from a revoked token and revokes every live
   * descendant, so a token proven to have been used twice takes its whole
   * rotation branch down with it (SA §13).
   */
  private async revokeReplacementChain(startId: string | null): Promise<void> {
    let currentTokenId: string | null = startId;
    while (currentTokenId) {
      const nextToken = await this.authTokenRepository.findById(currentTokenId);
      if (!nextToken) break;
      if (!nextToken.revokedAt) {
        await this.authTokenRepository.revoke(nextToken.id, new Date());
      }
      currentTokenId = nextToken.replacedBy;
    }
  }

  private reuseDetected(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'REFRESH_TOKEN_REUSED',
      message: 'رمز التحديث مستخدم مسبقاً وتم إلغاء الجلسة',
    });
  }
}
