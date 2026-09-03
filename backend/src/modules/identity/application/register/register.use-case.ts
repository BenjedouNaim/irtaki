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

    // 1. Duplicate fast path (VR-01). This is only a cheap early exit: the
    //    authoritative guarantee is `DB-UQ-01`, whose violation step 4
    //    translates into this same 409 (TS §20, §21).
    const existing = await this.userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw this.emailTaken();
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

    //    The insert races every other registration of the same address; the
    //    loser hits `DB-UQ-01` and gets the documented 409 rather than a 500.
    let savedUser: User;
    try {
      savedUser = await this.userRepository.save(user);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw this.emailTaken();
      }
      throw err;
    }

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

  /**
   * The one `409 EMAIL_TAKEN` body (APIS §10.1), shared by the fast-path
   * pre-check and the `DB-UQ-01` translation so the two can never drift.
   */
  private emailTaken(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'EMAIL_TAKEN',
      message: 'البريد الإلكتروني مستخدم بالفعل',
    });
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

/** Postgres `unique_violation` as TypeORM surfaces it (DB-UQ-01). */
function isUniqueViolation(err: unknown): boolean {
  const e = err as {
    code?: string;
    driverError?: { code?: string; constraint?: string };
  };
  return e?.code === '23505' || e?.driverError?.code === '23505';
}
