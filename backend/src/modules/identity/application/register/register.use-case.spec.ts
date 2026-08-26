/* eslint-disable @typescript-eslint/unbound-method */
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { RegisterUseCase } from './register.use-case';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../domain/password-hasher.interface';
import { TokenService } from '../token/token.service';
import { AuditEntryTypeOrmEntity } from '../../infrastructure/audit-entry.typeorm-entity';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';

describe('RegisterUseCase', () => {
  let useCase: RegisterUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockAuditRepo: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAllByRole: jest.fn(),
      save: jest.fn().mockImplementation((user: User) => Promise.resolve(user)),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('$argon2id$hashedpassword'),
      verify: jest.fn().mockResolvedValue(true),
    };

    mockTokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      }),
    } as unknown as jest.Mocked<TokenService>;

    mockConfigService = {
      get: jest.fn().mockReturnValue('Africa/Tunis'),
    } as unknown as jest.Mocked<ConfigService>;

    mockAuditRepo = {
      save: jest.fn().mockResolvedValue(new AuditEntryTypeOrmEntity()),
    } as unknown as jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

    useCase = new RegisterUseCase(
      mockUserRepo,
      mockPasswordHasher,
      mockTokenService,
      mockConfigService,
      mockAuditRepo,
    );
  });

  it('creates user with role User, hashes password, saves, and returns tokens', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({
      email: 'Test@Example.Com',
      password: 'Password123!',
      timezone: 'Africa/Tunis',
    });

    expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(mockPasswordHasher.hash).toHaveBeenCalledWith('Password123!');
    expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      role: UserRole.User,
      email: 'test@example.com',
      timezone: 'Africa/Tunis',
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
    });
    expect(
      (result as unknown as Record<string, unknown>).password_hash,
    ).toBeUndefined();
  });

  it('throws 409 EMAIL_TAKEN when email already exists', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(
      new User({
        email: 'existing@example.com',
        passwordHash: 'hash',
        timezone: 'Africa/Tunis',
      }),
    );

    await expect(
      useCase.execute({
        email: 'existing@example.com',
        password: 'Password123!',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
