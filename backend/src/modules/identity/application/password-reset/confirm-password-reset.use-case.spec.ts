/* eslint-disable @typescript-eslint/unbound-method */
import { BadRequestException } from '@nestjs/common';
import { User } from '../../domain/user.entity';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IPasswordHasher } from '../../domain/password-hasher.interface';
import { AuthTokenRepository } from '../../infrastructure/auth-token.repository';
import { AuthTokenTypeOrmEntity } from '../../infrastructure/auth-token.typeorm-entity';
import { TokenService } from '../token/token.service';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';

describe('ConfirmPasswordResetUseCase', () => {
  let useCase: ConfirmPasswordResetUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockPasswordHasher: jest.Mocked<IPasswordHasher>;
  let mockTokenService: jest.Mocked<TokenService>;
  let mockAuthTokenRepo: jest.Mocked<AuthTokenRepository>;

  function resetToken(
    overrides: Partial<AuthTokenTypeOrmEntity> = {},
  ): AuthTokenTypeOrmEntity {
    const tokenEntity = new AuthTokenTypeOrmEntity();
    tokenEntity.id = 'token-uuid-1';
    tokenEntity.userId = 'user-uuid-1';
    tokenEntity.tokenHash = 'hashed_valid-token';
    tokenEntity.purpose = 'password_reset';
    tokenEntity.issuedAt = new Date();
    tokenEntity.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins left
    tokenEntity.revokedAt = null;
    return Object.assign(tokenEntity, overrides);
  }

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findPageByRole: jest.fn(),
      countByRole: jest.fn(),
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

    mockAuthTokenRepo = {
      findByHash: jest.fn(),
      findById: jest.fn(),
      rotateConditionally: jest.fn(),
      revokeConditionally: jest.fn().mockResolvedValue(true),
      revoke: jest.fn(),
      revokeAllRefreshTokensForUser: jest.fn(),
    } as unknown as jest.Mocked<AuthTokenRepository>;

    useCase = new ConfirmPasswordResetUseCase(
      mockUserRepo,
      mockPasswordHasher,
      mockTokenService,
      mockAuthTokenRepo,
    );
  });

  it('successfully resets password, revokes the reset token, and revokes all active refresh tokens', async () => {
    const user = new User({
      id: 'user-uuid-1',
      email: 'user@example.com',
      passwordHash: 'oldHash',
      timezone: 'Africa/Tunis',
    });

    mockAuthTokenRepo.findByHash.mockResolvedValue(resetToken());
    mockUserRepo.findById.mockResolvedValue(user);
    mockUserRepo.save.mockResolvedValue(user);

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
    expect(mockAuthTokenRepo.revokeConditionally).toHaveBeenCalledWith(
      'token-uuid-1',
      expect.any(Date),
    );
    expect(
      mockAuthTokenRepo.revokeAllRefreshTokensForUser,
    ).toHaveBeenCalledWith(user.id, expect.any(Date));
    expect(result.message).toBe('تم تغيير كلمة المرور بنجاح');
  });

  it('consumes the reset token before writing the new password, so the guard gates the whole operation', async () => {
    const user = new User({
      id: 'user-uuid-1',
      email: 'user@example.com',
      passwordHash: 'oldHash',
      timezone: 'Africa/Tunis',
    });

    mockAuthTokenRepo.findByHash.mockResolvedValue(resetToken());
    mockUserRepo.findById.mockResolvedValue(user);
    mockUserRepo.save.mockResolvedValue(user);

    await useCase.execute({
      token: 'valid-token',
      new_password: 'NewStrongPassword123!',
    });

    const revokeOrder =
      mockAuthTokenRepo.revokeConditionally.mock.invocationCallOrder[0];
    const saveOrder = mockUserRepo.save.mock.invocationCallOrder[0];
    expect(revokeOrder).toBeLessThan(saveOrder);
  });

  it('never writes the password when a concurrent replay already consumed the token', async () => {
    const user = new User({
      id: 'user-uuid-1',
      email: 'user@example.com',
      passwordHash: 'oldHash',
      timezone: 'Africa/Tunis',
    });

    // The row was live when read, so every pre-check passes; the guarded
    // UPDATE affects 0 rows because the racing request took it first.
    mockAuthTokenRepo.findByHash.mockResolvedValue(resetToken());
    mockUserRepo.findById.mockResolvedValue(user);
    mockAuthTokenRepo.revokeConditionally.mockResolvedValue(false);

    await expect(
      useCase.execute({
        token: 'valid-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockUserRepo.save).not.toHaveBeenCalled();
    expect(user.passwordHash).toBe('oldHash');
    expect(
      mockAuthTokenRepo.revokeAllRefreshTokensForUser,
    ).not.toHaveBeenCalled();
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token not found', async () => {
    mockAuthTokenRepo.findByHash.mockResolvedValue(null);

    await expect(
      useCase.execute({
        token: 'unknown-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token is already revoked', async () => {
    mockAuthTokenRepo.findByHash.mockResolvedValue(
      resetToken({
        tokenHash: 'hashed_revoked-token',
        issuedAt: new Date(Date.now() - 20 * 60 * 1000),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        revokedAt: new Date(Date.now() - 5 * 60 * 1000), // Already used
      }),
    );

    await expect(
      useCase.execute({
        token: 'revoked-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockAuthTokenRepo.revokeConditionally).not.toHaveBeenCalled();
  });

  it('throws BadRequestException (INVALID_OR_EXPIRED_TOKEN) if token is expired', async () => {
    mockAuthTokenRepo.findByHash.mockResolvedValue(
      resetToken({
        tokenHash: 'hashed_expired-token',
        issuedAt: new Date(Date.now() - 40 * 60 * 1000),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000), // Expired 10m ago
      }),
    );

    await expect(
      useCase.execute({
        token: 'expired-token',
        new_password: 'NewStrongPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(mockAuthTokenRepo.revokeConditionally).not.toHaveBeenCalled();
  });
});
