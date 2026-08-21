/* eslint-disable @typescript-eslint/unbound-method */
import { User } from '../../domain/user.entity';
import { IUserRepository } from '../../domain/user.repository.interface';
import { IMailer } from '../../domain/mailer.interface';
import { TokenService } from '../token/token.service';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';

describe('RequestPasswordResetUseCase', () => {
  let useCase: RequestPasswordResetUseCase;
  let mockUserRepo: jest.Mocked<IUserRepository>;
  let mockMailer: jest.Mocked<IMailer>;
  let mockTokenService: jest.Mocked<TokenService>;

  beforeEach(() => {
    mockUserRepo = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
    };

    mockMailer = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };

    mockTokenService = {
      generatePasswordResetToken: jest.fn().mockResolvedValue({
        rawToken: 'mock-raw-token-123',
        tokenId: 'token-uuid',
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      }),
    } as unknown as jest.Mocked<TokenService>;

    useCase = new RequestPasswordResetUseCase(
      mockUserRepo,
      mockMailer,
      mockTokenService,
    );
  });

  it('generates token and sends email when user is found, returning standard message', async () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: 'hashedPass',
      timezone: 'Africa/Tunis',
    });
    mockUserRepo.findByEmail.mockResolvedValue(user);

    const result = await useCase.execute({ email: 'USER@example.com' });

    expect(mockUserRepo.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(mockTokenService.generatePasswordResetToken).toHaveBeenCalledWith(
      user.id,
    );
    expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@example.com',
      'mock-raw-token-123',
    );
    expect(result.message).toBe(
      'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    );
  });

  it('returns identical message without generating token or sending email when user is not found (anti-enumeration)', async () => {
    mockUserRepo.findByEmail.mockResolvedValue(null);

    const result = await useCase.execute({ email: 'unknown@example.com' });

    expect(mockUserRepo.findByEmail).toHaveBeenCalledWith(
      'unknown@example.com',
    );
    expect(mockTokenService.generatePasswordResetToken).not.toHaveBeenCalled();
    expect(mockMailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(result.message).toBe(
      'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    );
  });

  it('handles mailer error gracefully and still returns standard message (SA §559)', async () => {
    const user = new User({
      email: 'user@example.com',
      passwordHash: 'hashedPass',
      timezone: 'Africa/Tunis',
    });
    mockUserRepo.findByEmail.mockResolvedValue(user);
    mockMailer.sendPasswordResetEmail.mockRejectedValue(
      new Error('Mailgun network failure'),
    );

    const result = await useCase.execute({ email: 'user@example.com' });

    expect(mockMailer.sendPasswordResetEmail).toHaveBeenCalled();
    expect(result.message).toBe(
      'إذا كان البريد الإلكتروني مسجلاً، فقد تم إرسال رابط إعادة تعيين كلمة المرور.',
    );
  });
});
