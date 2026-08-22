/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ListUsersUseCase } from './list-users.use-case';
import {
  USER_REPOSITORY,
  IUserRepository,
} from '../../domain/user.repository.interface';
import { UserRole } from '../../domain/user-role.enum';
import { User } from '../../domain/user.entity';

describe('ListUsersUseCase', () => {
  let useCase: ListUsersUseCase;
  let userRepository: jest.Mocked<IUserRepository>;

  const mockUsers = [
    new User({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'teacher@test.com',
      role: UserRole.Teacher,
      fullName: 'الشيخ محمد',
    }),
    new User({
      id: '22222222-2222-2222-2222-222222222222',
      email: 'assistant@test.com',
      role: UserRole.Assistant,
      fullName: 'الأستاذ أحمد',
    }),
    new User({
      id: '33333333-3333-3333-3333-333333333333',
      email: 'user-no-name@test.com',
      role: UserRole.User,
      fullName: null,
    }),
  ];

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IUserRepository>> = {
      findAllByRole: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListUsersUseCase,
        {
          provide: USER_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    useCase = module.get<ListUsersUseCase>(ListUsersUseCase);
    userRepository = module.get(USER_REPOSITORY);
  });

  it('returns all users when role query is undefined', async () => {
    userRepository.findAllByRole.mockResolvedValue(mockUsers);

    const result = await useCase.execute({});

    expect(userRepository.findAllByRole).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'teacher@test.com',
          full_name: 'الشيخ محمد',
          role: UserRole.Teacher,
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          email: 'assistant@test.com',
          full_name: 'الأستاذ أحمد',
          role: UserRole.Assistant,
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          email: 'user-no-name@test.com',
          full_name: null,
          role: UserRole.User,
        },
      ],
    });
  });

  it('returns filtered users when role query is provided', async () => {
    userRepository.findAllByRole.mockResolvedValue([mockUsers[0]]);

    const result = await useCase.execute({ role: UserRole.Teacher });

    expect(userRepository.findAllByRole).toHaveBeenCalledWith(UserRole.Teacher);
    expect(result.data.length).toBe(1);
    expect(result.data[0].role).toBe(UserRole.Teacher);
  });
});
