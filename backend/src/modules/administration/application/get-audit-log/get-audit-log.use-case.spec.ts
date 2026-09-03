/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import {
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import { AuditAction } from '../../domain/audit-action.enum';
import {
  AUDIT_ENTRY_REPOSITORY,
  AuditLogRecord,
  IAuditEntryRepository,
} from '../../domain/audit-entry.repository.interface';
import { GetAuditLogUseCase } from './get-audit-log.use-case';

describe('GetAuditLogUseCase (F-ADM-03 / API-054)', () => {
  let useCase: GetAuditLogUseCase;
  let auditEntryRepository: jest.Mocked<IAuditEntryRepository>;

  function record(
    id: string,
    overrides: Partial<AuditLogRecord> = {},
  ): AuditLogRecord {
    return {
      id,
      actorId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      actorFullName: 'الشيخ عبد الرحمن',
      action: AuditAction.EnrollmentToggled,
      targetType: 'Group',
      targetId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      occurredAt: '2026-09-03T08:12:00.000000Z',
      ...overrides,
    };
  }

  const toggled = record('11111111-1111-1111-1111-111111111111');
  const login = record('22222222-2222-2222-2222-222222222222', {
    actorId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    actorFullName: null,
    action: AuditAction.Login,
    targetType: null,
    targetId: null,
    occurredAt: '2026-09-03T07:45:00.123456Z',
  });
  const created = record('33333333-3333-3333-3333-333333333333', {
    action: AuditAction.GroupCreated,
    occurredAt: '2026-09-02T19:30:00.000000Z',
  });

  beforeEach(async () => {
    const mockRepo: Partial<jest.Mocked<IAuditEntryRepository>> = {
      findPage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAuditLogUseCase,
        {
          provide: AUDIT_ENTRY_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile();

    useCase = module.get<GetAuditLogUseCase>(GetAuditLogUseCase);
    auditEntryRepository = module.get(AUDIT_ENTRY_REPOSITORY);
  });

  it('asks for the first unfiltered page with the default limit of 20 (APIS §9.2)', async () => {
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [toggled, login, created],
      hasMore: false,
    });

    const result = await useCase.execute({});

    expect(auditEntryRepository.findPage).toHaveBeenCalledWith({
      action: null,
      from: null,
      to: null,
      limit: 20,
      cursor: null,
    });
    expect(result).toEqual({
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          actor: {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            full_name: 'الشيخ عبد الرحمن',
          },
          action: AuditAction.EnrollmentToggled,
          target_type: 'Group',
          target_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          occurred_at: '2026-09-03T08:12:00.000Z',
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          actor: {
            id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            full_name: null,
          },
          action: AuditAction.Login,
          target_type: null,
          target_id: null,
          occurred_at: '2026-09-03T07:45:00.123Z',
        },
        {
          id: '33333333-3333-3333-3333-333333333333',
          actor: {
            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            full_name: 'الشيخ عبد الرحمن',
          },
          action: AuditAction.GroupCreated,
          target_type: 'Group',
          target_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          occurred_at: '2026-09-02T19:30:00.000Z',
        },
      ],
      pagination: { next_cursor: null, has_more: false },
    });
  });

  it.each([
    AuditAction.Login,
    AuditAction.GroupCreated,
    AuditAction.EnrollmentToggled,
  ])(
    'passes the %s action filter through unchanged (APIS §9.3)',
    async (action) => {
      auditEntryRepository.findPage.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute({ action });

      expect(auditEntryRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ action }),
      );
    },
  );

  it('passes the from/to date range through unchanged (APIS §9.3)', async () => {
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await useCase.execute({ from: '2026-09-01', to: '2026-09-03' });

    expect(auditEntryRepository.findPage).toHaveBeenCalledWith({
      action: null,
      from: '2026-09-01',
      to: '2026-09-03',
      limit: 20,
      cursor: null,
    });
  });

  it('emits a next_cursor built from the last row when another page exists', async () => {
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [toggled, login],
      hasMore: true,
    });

    const result = await useCase.execute({});

    expect(result.pagination.has_more).toBe(true);
    expect(decodeCursor(result.pagination.next_cursor)).toEqual({
      id: login.id,
      sortKey: { occurredAt: login.occurredAt },
    });
  });

  it('returns next_cursor null on the last page (APIS §9.2, ISS-18)', async () => {
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [toggled],
      hasMore: false,
    });

    const result = await useCase.execute({});

    expect(result.pagination).toEqual({ next_cursor: null, has_more: false });
  });

  it('never returns a total (APIS §9.1)', async () => {
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [toggled],
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
    auditEntryRepository.findPage.mockResolvedValue({
      rows: [],
      hasMore: false,
    });

    await useCase.execute({
      cursor: encodeCursor({
        id: login.id,
        sortKey: { occurredAt: login.occurredAt },
      }),
    });

    expect(auditEntryRepository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: login.id, sortKey: { occurredAt: login.occurredAt } },
      }),
    );
  });

  it.each([
    ['not base64 at all', 'not-a-cursor'],
    [
      'a valid cursor with a non-uuid id',
      encodeCursor({
        id: 'nope',
        sortKey: { occurredAt: '2026-09-01T08:00:00.000000Z' },
      }),
    ],
    [
      'a valid cursor with a millisecond-precision sort key',
      encodeCursor({
        id: '33333333-3333-3333-3333-333333333333',
        sortKey: { occurredAt: '2026-09-01T08:00:00.000Z' },
      }),
    ],
  ])(
    'treats %s as the first page rather than rejecting it',
    async (_label, cursor) => {
      auditEntryRepository.findPage.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute({ cursor });

      expect(auditEntryRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: null }),
      );
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
      auditEntryRepository.findPage.mockResolvedValue({
        rows: [],
        hasMore: false,
      });

      await useCase.execute({ limit: raw });

      expect(auditEntryRepository.findPage).toHaveBeenCalledWith(
        expect.objectContaining({ limit: expected }),
      );
    },
  );
});
