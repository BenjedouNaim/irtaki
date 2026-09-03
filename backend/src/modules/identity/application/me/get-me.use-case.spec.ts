import { UnauthorizedException } from '@nestjs/common';
import { GetMeUseCase } from './get-me.use-case';
import { IUserRepository } from '../../domain/user.repository.interface';
import { User } from '../../domain/user.entity';
import { UserRole } from '../../domain/user-role.enum';

describe('GetMeUseCase', () => {
  let useCase: GetMeUseCase;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  beforeEach(() => {
    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findPageByRole: jest.fn(),
      save: jest.fn(),
      promoteToStudent: jest.fn(),
      demoteToUser: jest.fn(),
      promoteFromUserRole: jest.fn(),
    };

    useCase = new GetMeUseCase(mockUserRepository);
  });

  it('successfully returns the profile data for an existing user without password hash', async () => {
    const user = new User({
      id: '01912345-6789-7000-8000-000000000001',
      email: 'student@example.com',
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$somehash',
      role: UserRole.Student,
      fullName: 'أحمد بن علي',
      gender: 'Male',
      timezone: 'Africa/Tunis',
    });
    mockUserRepository.findById.mockResolvedValue(user);

    const result = await useCase.execute(user.id);

    expect(result).toEqual({
      id: user.id,
      role: UserRole.Student,
      email: 'student@example.com',
      full_name: 'أحمد بن علي',
      gender: 'Male',
      timezone: 'Africa/Tunis',
    });
    const resultObj = result as unknown as Record<string, unknown>;
    expect(resultObj.passwordHash).toBeUndefined();
    expect(resultObj.password_hash).toBeUndefined();
  });

  it('throws UnauthorizedException when user does not exist in repository', async () => {
    mockUserRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute('non-existent-id')).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
