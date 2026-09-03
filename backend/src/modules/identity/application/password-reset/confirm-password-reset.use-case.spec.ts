/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { Repository, UpdateResult } from 'typeorm';
import { User } from '../../domain/user.entity';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../domain/password-hasher.interface';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';
import { TokenService } from '../token/token.service';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';

describe('ConfirmPasswordResetUseCase', () => {
  let useCase: ConfirmPasswordResetUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockTokenRepo: jest.Mocked<Repository<AuthTokenTypeOrmEntity>>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findPageByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
    };

    mockPasswordHasher = {
      hash: jest.fn().mockResolvedValue('newArgonHash123'),
      verify: jest.fn(),
    };

    mockTokenService = {
      hashResetToken: jest
        .fn()
        .mockImplementation((token: string) => `hashed_${token}`),
    } as unknown as jest.Mocked<TokenService>;

    const mockUpdateResult: UpdateResult = {
      raw: [],
      affected: 2,
      generatedMaps: [],
    };

    mockTokenRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(mockUpdateResult),
    } as unknown as jest.Mocked<Repository<AuthTokenTypeOrmEntity>>;

    useCase = new ConfirmPasswordResetUseCase(
      mockUserRepo,
      mockPasswordHasher,
      mockTokenService,
      mockTokenRepo,
    );
  });

  it('successfully resets password, revokes the reset token, and revokes all active refresh tokens', async () => {
    const user = new User({
      id: 'user-uuid-1',
      email: 'user@example.com',
      passwordHash: 'oldHash',
      timezone: 'Africa/Tunis',
    });

    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = 'token-uuid-1';
    tokenEntity.userId = user.id;
    tokenEntity.tokenHash = 'hashed_valid-token';
    tokenEntity.purpose = 'password_reset';
    tokenEntity.issuedAt = new Date();
    tokenEntity.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins left
    tokenEntity.revokedAt = null;

    mockTokenRepo.findOne.mockResolvedValue(tokenEntity);
    mockUserRepo.findById.mockResolvedValue(user);
    mockUserRepo.save.mockResolvedValue(user);
    mockTokenRepo.save.mockResolvedValue(tokenEntity);

    const result = await useCase.execute({
      token: 'valid-token',
      new_password: 'NewStrongPassword123!',
    });

    expect(mockTokenService.hashResetToken).toHaveBeenCalledWith('valid-token');
    expect(mockPasswordHasher.hash).toHaveBeenCalledWith(
      'NewStrongPassword123!',
    );
    expect(user.passwordHash).toBe('newArgonHash123');
    expect(mockUserRepo.save).toHaveBeenCalledWith(user);
    expect(tokenEntity.revokedAt).toBeInstanceOf(Date);
    expect(mockTokenRepo.save).toHaveBeenCalledWith(tokenEntity);
    expect(mockTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        purpose: 'refresh',
      }),
      expect.objectContaining({
        revokedAt: expect.any(Date),
      }),
    );
    expect(result.message).toBe('تم تغيير كلمة المرور بنجاح');
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token not found', async () => {
    mockTokenRepo.findOne.mockResolvedValue(null);

    await expect(
      useCase.execute({
        token: 'unknown-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token is already revoked', async () => {
    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = 'token-uuid-1';
    tokenEntity.userId = 'user-uuid-1';
    tokenEntity.tokenHash = 'hashed_revoked-token';
    tokenEntity.purpose = 'password_reset';
    tokenEntity.issuedAt = new Date(Date.now() - 20 * 60 * 1000);
    tokenEntity.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    tokenEntity.revokedAt = new Date(Date.now() - 5 * 60 * 1000); // Already used

    mockTokenRepo.findOne.mockResolvedValue(tokenEntity);

    await expect(
      useCase.execute({
        token: 'revoked-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token is expired', async () => {
    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = 'token-uuid-1';
    tokenEntity.userId = 'user-uuid-1';
    tokenEntity.tokenHash = 'hashed_expired-token';
    tokenEntity.purpose = 'password_reset';
    tokenEntity.issuedAt = new Date(Date.now() - 40 * 60 * 1000);
    tokenEntity.expiresAt = new Date(Date.now() - 10 * 60 * 1000); // Expired 10m ago
    tokenEntity.revokedAt = null;

    mockTokenRepo.findOne.mockResolvedValue(tokenEntity);

    await expect(
      useCase.execute({
        token: 'expired-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
