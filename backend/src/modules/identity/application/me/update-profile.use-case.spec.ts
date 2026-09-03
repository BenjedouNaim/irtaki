/* eslint-disable @typescript-eslint/unbound-method */
import { UnauthorizedException } from '@nestjs/common';
import { UpdateProfileUseCase } from './update-profile.use-case';
import { IUserRepository } from '../../domain/user.repository.interface';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';

describe('UpdateProfileUseCase', () => {
  let useCase: UpdateProfileUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findPageByRole: jest.fn(),
      countByRole: jest.fn(),
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
    };

    useCase = new UpdateProfileUseCase(mockUserRepository);
  });

  it('updates timezone successfully when given a valid IANA timezone string', async () => {
    const user = new User({
      id: '01912345-6789-7000-8000-000000000001',
      email: 'teacher@example.com',
      passwordHash: '$argon2id$somehash',
      role: UserRole.Teacher,
      fullName: 'الأستاذ خالد',
      gender: 'Male',
      timezone: 'Africa/Tunis',
    });
    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute(user.id, {
      timezone: 'Europe/Paris',
    });

    expect(user.timezone).toBe('Europe/Paris');
    expect(mockUserRepository.save).toHaveBeenCalledWith(user);
    expect(result.timezone).toBe('Europe/Paris');
    expect(result.email).toBe('teacher@example.com');
  });

  it('rejects invalid IANA timezone with 422 INVALID_TIMEZONE error', async () => {
    const user = new User({
      id: '01912345-6789-7000-8000-000000000001',
      email: 'teacher@example.com',
      passwordHash: '$argon2id$somehash',
      role: UserRole.Teacher,
      timezone: 'Africa/Tunis',
    });
    mockUserRepository.findById.mockResolvedValue(user);

    await expect(
      useCase.execute(user.id, {
        timezone: 'Mars/Phobos',
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: {
        error: 'INVALID_TIMEZONE',
      },
    });

    expect(mockUserRepository.save).not.toHaveBeenCalled();
  });

  it('returns current profile if no timezone is provided in dto', async () => {
    const user = new User({
      id: '01912345-6789-7000-8000-000000000001',
      email: 'admin@example.com',
      passwordHash: '$argon2id$somehash',
      role: UserRole.Admin,
      timezone: 'Africa/Tunis',
    });
    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute(user.id, {});

    expect(mockUserRepository.save).not.toHaveBeenCalled();
    expect(result.timezone).toBe('Africa/Tunis');
  });

  it('throws UnauthorizedException when user does not exist', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(
      useCase.execute('missing-user-id', { timezone: 'Africa/Tunis' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
