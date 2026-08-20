import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import type { IUserRepository } from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import type { IPasswordHasher } from '../../domain/password-hasher.interface';
import { PASSWORD_HASHER } from '../../domain/password-hasher.interface';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';
import { AuditEntryTypeOrmEntity } from '../../infrastructure/audit-entry.typeorm-entity';
import { TokenService } from '../token/token.service';
import { RegisterDto } from './register.dto';
import { RegisterResponseDto } from './register-response.dto';

@Injectable()
export class RegisterUseCase {
  private readonly centerTimezone: string;

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: IPasswordHasher,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    @InjectRepository(AuditEntryTypeOrmEntity)
    private readonly auditRepository: Repository<AuditEntryTypeOrmEntity>,
  ) {
    this.centerTimezone =
      this.configService.get<string>('CENTER_TIMEZONE') || 'Africa/Tunis';
  }

  async execute(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Duplicate check (DB-UQ-01, VR-01)
    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictException({
        error: 'EMAIL_TAKEN',
        message: 'البريد الإلكتروني مستخدم بالفعل',
      });
    }

    // 2. Hash password with argon2id (VR-02)
    const passwordHash = await this.passwordHasher.hash(dto.password);

    // 3. Resolve timezone (VR-28)
    const timezone = this.resolveTimezone(dto.timezone);

    // 4. Create and persist User domain entity
    const user = new User({
      email: normalizedEmail,
      passwordHash,
      role: UserRole.User,
      timezone,
    });

    const savedUser = await this.userRepository.save(user);

    // 5. Generate token pair (access + refresh)
    const tokens = await this.tokenService.generateTokenPair(
      savedUser,
      dto.device_token,
    );

    // 6. Write AuditEntry(LOGIN) side-effect (API-001, DBT-18)
    try {
      const audit = new AuditEntryTypeOrmEntity();
      audit.id = uuidv7();
      audit.actorId = savedUser.id;
      audit.action = 'LOGIN';
      audit.targetType = 'User';
      audit.targetId = savedUser.id;
      audit.previousValue = null;
      audit.newValue = { role: savedUser.role, email: savedUser.email };
      audit.occurredAt = new Date();
      await this.auditRepository.save(audit);
    } catch {
      // Audit failure should not block user registration (best-effort resilience)
    }

    // 7. Return API-001 response shape
    return {
      id: savedUser.id,
      role: savedUser.role,
      email: savedUser.email,
      timezone: savedUser.timezone,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    };
  }

  private resolveTimezone(tz?: string): string {
    if (!tz || typeof tz !== 'string') {
      return this.centerTimezone;
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return tz;
    } catch {
      return this.centerTimezone;
    }
  }
}
