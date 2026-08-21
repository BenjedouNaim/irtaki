import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IPasswordHasher } from '../../domain/password-hasher.interface';
import { PASSWORD_HASHER } from '../../domain/password-hasher.interface';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';
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
    @InjectRepository(AuthTokenTypeOrmEntity)
    private readonly tokenRepo: Repository<AuthTokenTypeOrmEntity>,
  ) {}

  async execute(
    dto: ConfirmPasswordResetDto,
  ): Promise<ConfirmPasswordResetResponse> {
    const tokenHash = this.tokenService.hashResetToken(dto.token);

    const tokenEntity = await this.tokenRepo.findOne({
      where: { tokenHash, purpose: 'password_reset' },
    });

    if (!tokenEntity) {
      throw new BadRequestException({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      });
    }

    // Single-use enforcement: if already revoked, reject
    if (tokenEntity.revokedAt !== null) {
      throw new BadRequestException({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      });
    }

    // Expiry check (30 minutes)
    if (tokenEntity.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      });
    }

    const user = await this.userRepository.findById(tokenEntity.userId);
    if (!user) {
      throw new BadRequestException({
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'رمز إعادة التعيين غير صالح أو منتهي الصلاحية',
      });
    }

    // Hash new password with Argon2id
    const newPasswordHash = await this.passwordHasher.hash(dto.new_password);
    user.updatePassword(newPasswordHash);
    await this.userRepository.save(user);

    const now = new Date();

    // Revoke the reset token (single-use)
    tokenEntity.revokedAt = now;
    await this.tokenRepo.save(tokenEntity);

    // Revoke all outstanding refresh tokens for this user (SA §13, APIS.md API-006 side effect)
    await this.tokenRepo.update(
      {
        userId: user.id,
        purpose: 'refresh',
        revokedAt: IsNull(),
      },
      {
        revokedAt: now,
      },
    );

    return {
      message: 'تم تغيير كلمة المرور بنجاح',
    };
  }
}
