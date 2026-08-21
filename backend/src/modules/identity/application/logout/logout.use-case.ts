import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';
import { TokenService } from '../token/token.service';
import { LogoutDto } from './logout.dto';

@Injectable()
export class LogoutUseCase {
  constructor(
    private readonly tokenService: TokenService,
    @InjectRepository(AuthTokenTypeOrmEntity)
    private readonly tokenRepo: Repository<AuthTokenTypeOrmEntity>,
  ) {}

  async execute(dto: LogoutDto): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(dto.refresh_token);

    const tokenEntity = await this.tokenRepo.findOne({
      where: { tokenHash, purpose: 'refresh' },
    });

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
      throw new UnauthorizedException({
        error: 'INVALID_REFRESH_TOKEN',
        message: 'رمز التحديث غير صالح أو منتهي الصلاحية',
      });
    }

    tokenEntity.revokedAt = new Date();
    await this.tokenRepo.save(tokenEntity);
  }
}
