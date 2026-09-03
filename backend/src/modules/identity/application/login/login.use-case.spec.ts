/* eslint-disable @typescript-eslint/unbound-method */
import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { LoginUseCase } from './login.use-case';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../domain/password-hasher.interface';
import { TokenService } from '../token/token.service';
import { AuditEntryTypeOrmEntity } from '../../infrastructure/audit-entry.typeorm-entity';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';

describe('LoginUseCase', () => {
  let useCase: LoginUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockAuditRepo: jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findAllByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
    };

    mockPasswordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
    };

    mockTokenService = {
      generateTokenPair: jest.fn().mockResolvedValue({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      }),
    } as unknown as jest.Mocked<TokenService>;

    mockAuditRepo = {
      save: jest.fn().mockResolvedValue(new AuditEntryTypeOrmEntity()),
    } as unknown as jest.Mocked<Repository<AuditEntryTypeOrmEntity>>;

    useCase = new LoginUseCase(
      mockUserRepo,
      mockPasswordHasher,
      mockTokenService,
      mockAuditRepo,
    );
  });

  it('successfully verifies credentials and returns tokens with dashboard_route', async () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: '$argon2id$hashedpassword',
      role: UserRole.Student,
      fullName: 'Ahmed Ali',
      gender: 'Male',
      timezone: 'Africa/Tunis',
    });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(true);

    const result = await useCase.execute({
      email: 'USER@example.COM',
      password: 'ValidPassword123!',
      device_token: 'device-123',
    });

    expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(mockPasswordHasher.verify).toHaveBeenCalledWith(
      '$argon2id$hashedpassword',
      'ValidPassword123!',
    );
    expect(mockTokenService.generateTokenPair).toHaveBeenCalledWith(
      user,
      'device-123',
    );
    expect(result).toEqual({
      id: user.id,
      role: UserRole.Student,
      full_name: 'Ahmed Ali',
      gender: 'Male',
      timezone: 'Africa/Tunis',
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      dashboard_route: 'student',
    });
  });

  it('throws 401 INVALID_CREDENTIALS when user is not found', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    await expect(
      useCase.execute({
        email: 'unknown@example.com',
        password: 'Password123!',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(mockPasswordHasher.verify).not.toHaveBeenCalled();
  });

  it('throws 401 INVALID_CREDENTIALS when password does not match', async () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: '$argon2id$hashedpassword',
      role: UserRole.User,
      timezone: 'Africa/Tunis',
    });

    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockPasswordHasher.verify.mockResolvedValue(false);

    await expect(
      useCase.execute({
        email: 'user@example.com',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
