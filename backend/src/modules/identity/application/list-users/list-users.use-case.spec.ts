/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import { ListUsersUseCase } from './list-users.use-case';
import {
  USER_REPOSITORY,
  IUserRepository,
  UserDirectoryRecord,
} from '../../domain/user.repository.interface';
import { UserRole } from '../../domain/user-role.enum';

describe('ListUsersUseCase (F-ADM-02 / API-053)', () => {
  let useCase: ListUsersUseCase;
  let userRepository: jest.Mocked<IUserRepository>;

  function record(
    id: string,
    overrides: Partial<UserDirectoryRecord> = {},
  ): UserDirectoryRecord {
    return {
      id,
      email: 'teacher@test.com',
      fullName: 'الشيخ محمد',
      role: UserRole.Teacher,
      createdAt: '2026-09-03T08:00:00.000000Z',
      ...overrides,
    };
  }

  const teacher = record('11111111-1111-1111-1111-111111111111');
  const assistant = record('22222222-2222-2222-2222-222222222222', {
    email: 'assistant@test.com',
    fullName: 'الأستاذ أحمد',
    role: UserRole.Assistant,
    createdAt: '2026-09-02T08:00:00.000000Z',
  });
  const plainUser = record('33333333-3333-3333-3333-333333333333', {
    email: 'user-no-name@test.com',
    fullName: null,
    role: UserRole.User,
    createdAt: '2026-09-01T08:00:00.123456Z',
  });

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IUserRepository>> = {
      findPageByRole: jest.fn(),
      countByRole: jest.fn(),
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

  it('asks for the first page of every role with the default limit of 20 (APIS §9.2)', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [teacher, assistant, plainUser],
      hasMore: false,
    });

    const result = await useCase.execute({});

    expect(userRepository.findPageByRole).toHaveBeenCalledWith({
      role: null,
      limit: 20,
      cursor: null,
    });
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
      pagination: { next_cursor: null, has_more: false },
    });
  });

  it('passes the role filter through unchanged (F-GRP-04 picker behaviour)', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [teacher],
      hasMore: false,
    });

    const result = await useCase.execute({ role: UserRole.Teacher });

    expect(userRepository.findPageByRole).toHaveBeenCalledWith({
      role: UserRole.Teacher,
      limit: 20,
      cursor: null,
    });
    expect(result.data).toHaveLength(1);
    expect(result.data[0].role).toBe(UserRole.Teacher);
  });

  it('emits a next_cursor built from the last row when another page exists', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [teacher, plainUser],
      hasMore: true,
    });

    const result = await useCase.execute({});

    expect(result.pagination.has_more).toBe(true);
    expect(decodeCursor(result.pagination.next_cursor)).toEqual({
      id: plainUser.id,
      sortKey: { createdAt: plainUser.createdAt },
    });
  });

  it('returns next_cursor null on the last page (APIS §9.2, ISS-18)', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [teacher],
      hasMore: false,
    });

    const result = await useCase.execute({});

    expect(result.pagination).toEqual({ next_cursor: null, has_more: false });
  });

  it('never returns a total (APIS §9.1)', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [teacher],
      hasMore: true,
    });

    const result = await useCase.execute({});

    expect(Object.keys(result.pagination).sort()).toEqual([
      'has_more',
      'next_cursor',
    ]);
    expect(result).not.toHaveProperty('total');
  });

  it('decodes a well-formed cursor into the keyset position', async () => {
    userRepository.findPageByRole.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await useCase.execute({
      cursor: encodeCursor({
        id: assistant.id,
        sortKey: { createdAt: assistant.createdAt },
      }),
    });

    expect(userRepository.findPageByRole).toHaveBeenCalledWith({
      role: null,
      limit: 20,
      cursor: {
        id: assistant.id,
        sortKey: { createdAt: assistant.createdAt },
      },
    });
  });

  it.each([
    ['not base64 at all', 'not-a-cursor'],
    [
      'a valid cursor with a non-uuid id',
      encodeCursor({
        id: 'nope',
        sortKey: { createdAt: '2026-09-01T08:00:00.000000Z' },
      }),
    ],
    [
      'a valid cursor with a malformed sort key',
      encodeCursor({
        id: '33333333-3333-3333-3333-333333333333',
        sortKey: { createdAt: '2026-09-01' },
      }),
    ],
  ])(
    'treats %s as the first page rather than rejecting it',
    async (_label, cursor) => {
      userRepository.findPageByRole.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute({ cursor });

      expect(userRepository.findPageByRole).toHaveBeenCalledWith({
        role: null,
        limit: 20,
        cursor: null,
      });
    },
  );

  it.each([
    ['0', 1],
    ['-5', 1],
    ['1000', 100],
    ['7', 7],
    ['abc', 20],
  ])(
    'clamps limit=%s to %s instead of rejecting it (APIS §9.2)',
    async (raw, expected) => {
      userRepository.findPageByRole.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute({ limit: raw });

      expect(userRepository.findPageByRole).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expected }),
      );
    },
  );
});
