import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IPasswordHasher } from '../../domain/password-hasher.interface';
import { PASSWORD_HASHER } from '../../domain/password-hasher.interface';
import { AuthTokenRepository } from '../../infrastructure/auth-token.repository';
import { TokenService } from '../token/token.service';
import { ConfirmPasswordResetDto } from './confirm-password-reset.dto';

export interface ConfirmPasswordResetResponse {
  message: string;
}

@Injectable()
export class ConfirmPasswordResetUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: TokenService,
    private readonly authTokenRepository: AuthTokenRepository,
  ) {}

  async execute(
    dto: ConfirmPasswordResetDto,
  ): Promise<ConfirmPasswordResetResponse> {
    const tokenHash = this.tokenService.hashResetToken(dto.token);

    const tokenEntity = await this.authTokenRepository.findByHash(
      tokenHash,
      'password_reset',
    );

    if (!tokenEntity) {
      throw this.invalidToken();
    }

    // Fast error path only — single-use is enforced by the guarded revoke below
    if (tokenEntity.revokedAt !== null) {
      throw this.invalidToken();
    }

    // Expiry check (30 minutes)
    if (tokenEntity.expiresAt.getTime() < Date.now()) {
      throw this.invalidToken();
    }

    const user = await this.userRepository.findById(tokenEntity.userId);
    if (!user) {
      throw this.invalidToken();
    }

    // Hash new password with Argon2id. Argon2 is deliberately slow, so it runs
    // before the token is consumed — it has no side effect, and doing it here
    // keeps the window between revoking the token and writing the password
    // down to a single round trip.
    const newPasswordHash = await this.passwordHasher.hash(dto.new_password);

    const now = new Date();

    // Single-use enforcement (TS §20): the token is consumed *before* the
    // password is written, so this one guarded statement gates the whole
    // operation. Two concurrent replays of one reset token both pass the check
    // above; only the one that takes the token here goes on to set a password.
    const consumed = await this.authTokenRepository.revokeConditionally(
      tokenEntity.id,
      now,
    );

    if (!consumed) {
      throw this.invalidToken();
    }

    user.updatePassword(newPasswordHash);
    await this.userRepository.save(user);

    // Revoke all outstanding refresh tokens for this user (SA §13, APIS.md API-006 side effect)
    await this.authTokenRepository.revokeAllRefreshTokensForUser(user.id, now);

    return {
      message: 'تم تغيير كلمة المرور بنجاح',
    };
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      error: 'INVALID_OR_EXPIRED_TOKEN',
      message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
    });
  }
}
