import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { User } from '../../domain/user.entity';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  tokenId: string;
}

@Injectable()
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshPepper: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(AuthTokenTypeOrmEntity)
    private readonly tokenRepo: Repository<AuthTokenTypeOrmEntity>,
  ) {
    this.accessSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'dev-secret-key-must-be-changed-in-prod-min-32-chars';
    this.refreshPepper =
      this.configService.get<string>('JWT_REFRESH_PEPPER') ||
      'dev-pepper-key-must-be-changed-in-prod-min-32-chars';
  }

  async generateTokenPair(
    user: User,
    deviceToken?: string | null,
  ): Promise<GeneratedTokens> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: '1h',
    });

    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = uuidv7();
    tokenEntity.userId = user.id;
    tokenEntity.tokenHash = tokenHash;
    tokenEntity.purpose = 'refresh';
    tokenEntity.deviceToken = deviceToken ?? null;
    tokenEntity.issuedAt = now;
    tokenEntity.expiresAt = expiresAt;
    tokenEntity.revokedAt = null;
    tokenEntity.replacedBy = null;

    await this.tokenRepo.save(tokenEntity);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenId: tokenEntity.id,
    };
  }

  public hashRefreshToken(refreshToken: string): string {
    return crypto
      .createHmac('sha256', this.refreshPepper)
      .update(refreshToken)
      .digest('hex');
  }

  async generatePasswordResetToken(
    userId: string,
  ): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = uuidv7();
    tokenEntity.userId = userId;
    tokenEntity.tokenHash = tokenHash;
    tokenEntity.purpose = 'password_reset';
    tokenEntity.deviceToken = null;
    tokenEntity.issuedAt = now;
    tokenEntity.expiresAt = expiresAt;
    tokenEntity.revokedAt = null;
    tokenEntity.replacedBy = null;

    await this.tokenRepo.save(tokenEntity);

    return {
      rawToken,
      tokenId: tokenEntity.id,
      expiresAt,
    };
  }

  public hashResetToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
