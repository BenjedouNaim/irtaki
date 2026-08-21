import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';
import { TokenService } from '../token/token.service';
import { RefreshDto } from './refresh.dto';
import { RefreshResponseDto } from './refresh-response.dto';

@Injectable()
export class RefreshUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    private readonly tokenService: TokenService,
    @InjectRepository(AuthTokenTypeOrmEntity)
    private readonly tokenRepo: Repository<AuthTokenTypeOrmEntity>,
  ) {}

  async execute(dto: RefreshDto): Promise<RefreshResponseDto> {
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

    // Reuse detection (SA §13): presenting an already revoked token revokes its entire replacement chain
    if (tokenEntity.revokedAt !== null) {
      let currentTokenId: string | null = tokenEntity.replacedBy;
      while (currentTokenId) {
        const nextToken = await this.tokenRepo.findOne({
          where: { id: currentTokenId },
        });
        if (!nextToken) break;
        if (!nextToken.revokedAt) {
          nextToken.revokedAt = new Date();
          await this.tokenRepo.save(nextToken);
        }
        currentTokenId = nextToken.replacedBy;
      }

      throw new UnauthorizedException({
        error: 'REFRESH_TOKEN_REUSED',
        message: 'رمز التحديث مستخدم مسبقاً وتم إلغاء الجلسة',
      });
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

    // Generate new token pair
    const newTokens = await this.tokenService.generateTokenPair(
      user,
      tokenEntity.deviceToken,
    );

    // Revoke old token and record rotation link
    tokenEntity.revokedAt = new Date();
    tokenEntity.replacedBy = newTokens.tokenId;
    await this.tokenRepo.save(tokenEntity);

    return {
      access_token: newTokens.accessToken,
      refresh_token: newTokens.refreshToken,
    };
  }
}
