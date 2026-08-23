import { Inject, Injectable } from '@nestjs/common';
import {
  type IJoinRequestRepository,
  JOIN_REQUEST_REPOSITORY,
} from '../../domain/join-request.repository.interface';

import { UserRole } from '../../../identity/domain/user-role.enum';
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import { ListPendingJoinRequestsQueryDto } from './list-pending-join-requests-query.dto';
import {
  JoinRequestQueueItemDto,
  ListPendingJoinRequestsResponseDto,
} from './list-pending-join-requests-response.dto';

interface JoinRequestCursorSortKey {
  score: number;
  createdAt: string;
}

@Injectable()
export class ListPendingJoinRequestsUseCase {
  constructor(
    @Inject(JOIN_REQUEST_REPOSITORY)
    private readonly joinRequestRepo: IJoinRequestRepository,
  ) {}

  async execute(
    callerId: string,
    callerRole: string,
    query: ListPendingJoinRequestsQueryDto,
  ): Promise<ListPendingJoinRequestsResponseDto> {
    const assistantId =
      callerRole === (UserRole.Admin as string) ? null : callerId;
    const limit = clampLimit(query.limit, { default: 20, max: 100, min: 1 });

    const decodedCursor = decodeCursor<JoinRequestCursorSortKey>(query.cursor);

    const { rows, hasMore } = await this.joinRequestRepo.findPendingQueue({
      assistantId,
      limit,
      cursor: decodedCursor,
    });

    const data: JoinRequestQueueItemDto[] = rows.map((r) => ({
      id: r.id,
      full_name: r.fullName,
      score: Number(r.score),
      created_at:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
    }));

    let next_cursor: string | null = null;
    if (hasMore && rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const isoCreatedAt =
        lastRow.createdAt instanceof Date
          ? lastRow.createdAt.toISOString()
          : new Date(lastRow.createdAt).toISOString();

      next_cursor = encodeCursor({
        id: lastRow.id,
        sortKey: {
          score: Number(lastRow.score),
          createdAt: isoCreatedAt,
        },
      });
    }

    return {
      data,
      pagination: {
        next_cursor,
        has_more: hasMore,
      },
    };
  }
}
