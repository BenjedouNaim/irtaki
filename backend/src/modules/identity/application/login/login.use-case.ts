import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IPasswordHasher } from '../../domain/password-hasher.interface';
import { PASSWORD_HASHER } from '../../domain/password-hasher.interface';
import { AuditEntryTypeOrmEntity } from '../../infrastructure/audit-entry.typeorm-entity';
import { TokenService } from '../token/token.service';
import { LoginDto } from './login.dto';
import { LoginResponseDto } from './login-response.dto';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: TokenService,
    @InjectRepository(AuditEntryTypeOrmEntity)
    private readonly auditRepository: Repository<AuditEntryTypeOrmEntity>,
  ) {}

  async execute(dto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Uniform error for unknown email or wrong password (anti-enumeration)
    const invalidCredentialsException = new UnauthorizedException({
      error: 'INVALID_CREDENTIALS',
      message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    });

    const user = await this.userRepository.findByEmail(normalizedEmail);
    if (!user) {
      throw invalidCredentialsException;
    }

    // 2. Verify password
    const isPasswordValid = await this.passwordHasher.verify(
      user.passwordHash,
      dto.password,
    );
    if (!isPasswordValid) {
      throw invalidCredentialsException;
    }

    // 3. Generate token pair
    const tokens = await this.tokenService.generateTokenPair(
      user,
      dto.device_token,
    );

    // 4. Record AuditEntry(LOGIN) side-effect (DEC-D05)
    try {
      const audit = new AuditEntryTypeOrmEntity();
      audit.id = uuidv7();
      audit.actorId = user.id;
      audit.action = 'LOGIN';
      audit.targetType = 'User';
      audit.targetId = user.id;
      audit.previousValue = null;
      audit.newValue = { role: user.role, email: user.email };
      audit.occurredAt = new Date();
      await this.auditRepository.save(audit);
    } catch {
      // Audit failure should not block user login
    }

    // 5. Return API-002 response shape
    return {
      id: user.id,
      role: user.role,
      full_name: user.fullName,
      gender: user.gender,
      timezone: user.timezone,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      dashboard_route: user.role.toLowerCase(),
    };
  }
}
