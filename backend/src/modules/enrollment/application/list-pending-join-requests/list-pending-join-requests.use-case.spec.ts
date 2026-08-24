/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { ListPendingJoinRequestsUseCase } from './list-pending-join-requests.use-case';
import {
  IJoinRequestRepository,
  JOIN_REQUEST_REPOSITORY,
  JoinRequestQueueRow,
} from '../../domain/join-request.repository.interface';
import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';

describe('ListPendingJoinRequestsUseCase', () => {
  let useCase: ListPendingJoinRequestsUseCase;
  let mockRepository: jest.Mocked<IJoinRequestRepository>;

  const mockRows: JoinRequestQueueRow[] = [
    {
      id: '01916362-e61e-7f61-8270-b74e892c90c1',
      fullName: 'أحمد التونسي',
      score: 95.5,
      createdAt: new Date('2026-08-20T10:00:00.000Z'),
    },
    {
      id: '01916362-e61e-7f61-8270-b74e892c90c2',
      fullName: 'محمد الفاسي',
      score: 80.0,
      createdAt: new Date('2026-08-21T11:00:00.000Z'),
    },
  ];

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn(),
      existsPendingForUser: jest.fn(),
      findLatestForUser: jest.fn(),
      findByIdForDetail: jest.fn(),
      findPendingQueue: jest.fn().mockResolvedValue({
        rows: mockRows,
        hasMore: false,
      }),
      acceptConditionally: jest.fn(),
      rejectConditionally: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ListPendingJoinRequestsUseCase,
        {
          provide: JOIN_REQUEST_REPOSITORY,
          useValue: mockRepository,
        },
      ],
    }).compile();

    useCase = module.get<ListPendingJoinRequestsUseCase>(
      ListPendingJoinRequestsUseCase,
    );
  });

  it('passes assistantId: null when callerRole is Admin', async () => {
    const result = await useCase.execute('admin-id', UserRole.Admin, {});

    expect(mockRepository.findPendingQueue).toHaveBeenCalledWith({
      assistantId: null,
      limit: 20,
      cursor: null,
    });
    expect(result.data).toHaveLength(2);
    expect(result.pagination.has_more).toBe(false);
    expect(result.pagination.next_cursor).toBeNull();
  });

  it('passes assistantId: callerId when callerRole is Assistant', async () => {
    await useCase.execute('assistant-123', UserRole.Assistant, {});

    expect(mockRepository.findPendingQueue).toHaveBeenCalledWith({
      assistantId: 'assistant-123',
      limit: 20,
      cursor: null,
    });
  });

  it('clamps query limit and decodes cursor properly', async () => {
    const rawCursor = encodeCursor({
      id: '01916362-e61e-7f61-8270-b74e892c90c1',
      sortKey: {
        score: 95.5,
        createdAt: '2026-08-20T10:00:00.000Z',
      },
    });

    await useCase.execute('assistant-123', UserRole.Assistant, {
      limit: '500',
      cursor: rawCursor,
    });

    expect(mockRepository.findPendingQueue).toHaveBeenCalledWith({
      assistantId: 'assistant-123',
      limit: 100,
      cursor: {
        id: '01916362-e61e-7f61-8270-b74e892c90c1',
        sortKey: {
          score: 95.5,
          createdAt: '2026-08-20T10:00:00.000Z',
        },
      },
    });
  });

  it('returns next_cursor when hasMore is true', async () => {
    mockRepository.findPendingQueue.mockResolvedValueOnce({
      rows: mockRows,
      hasMore: true,
    });

    const result = await useCase.execute('assistant-123', UserRole.Assistant, {
      limit: 2,
    });

    expect(result.pagination.has_more).toBe(true);
    expect(result.pagination.next_cursor).not.toBeNull();

    const decoded = decodeCursor<{ score: number; createdAt: string }>(
      result.pagination.next_cursor,
    );
    expect(decoded).toEqual({
      id: mockRows[1].id,
      sortKey: {
        score: 80.0,
        createdAt: mockRows[1].createdAt.toISOString(),
      },
    });
  });

  it('formats output with strictly lean shape (id, full_name, score, created_at)', async () => {
    const result = await useCase.execute(
      'assistant-123',
      UserRole.Assistant,
      {},
    );

    expect(result.data).toEqual([
      {
        id: '01916362-e61e-7f61-8270-b74e892c90c1',
        full_name: 'أحمد التونسي',
        score: 95.5,
        created_at: '2026-08-20T10:00:00.000Z',
      },
      {
        id: '01916362-e61e-7f61-8270-b74e892c90c2',
        full_name: 'محمد الفاسي',
        score: 80.0,
        created_at: '2026-08-21T11:00:00.000Z',
      },
    ]);

    for (const item of result.data) {
      expect(Object.keys(item).sort()).toEqual([
        'created_at',
        'full_name',
        'id',
        'score',
      ]);
    }
  });
});
