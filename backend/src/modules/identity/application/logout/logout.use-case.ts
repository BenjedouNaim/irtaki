import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthTokenRepository } from '../../infrastructure/auth-token.repository';
import { TokenService } from '../token/token.service';
import { LogoutDto } from './logout.dto';

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authTokenRepository: AuthTokenRepository,
  ) {}

  async execute(dto: LogoutDto): Promise<void> {
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

    if (
      tokenEntity.revokedAt !== null ||
      tokenEntity.expiresAt.getTime() < Date.now()
    ) {
      throw this.invalidToken();
    }

    // The check above is a fast path only; this guarded write is what decides
    // (TS §20). Two concurrent logouts of one token both pass the check, and
    // 0 rows affected here is the second one learning the token was already
    // revoked. Same answer as the sequential replay above.
    const revoked = await this.authTokenRepository.revokeConditionally(
      tokenEntity.id,
      new Date(),
    );

    if (!revoked) {
      throw this.invalidToken();
    }
  }

  private invalidToken(): UnauthorizedException {
    return new UnauthorizedException({
      error: 'INVALID_REFRESH_TOKEN',
      message: 'رمز التحديث غير صالح أو منتهي الصلاحية',
    });
  }
}
