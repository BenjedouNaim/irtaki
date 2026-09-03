import { Inject, Injectable } from '@nestjs/common';
import {
  clampLimit,
  encodeCursor,
} from '../../../../shared/pagination/cursor.util';
import type {
  IUserRepository,
  UsersCursor,
} from '../../domain/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/user.repository.interface';
import { ListUsersQueryDto } from './list-users-query.dto';
import { ListUsersResponseDto } from './user-list-item.dto';
import { parseUsersCursor } from './users-cursor';

/**
 * API-053 `GET /users?role=` — the Admin's user directory (SCR-32) and the
 * staff-assignment picker (F-GRP-04) are the same read: the picker passes
 * `role=Teacher`/`role=Assistant`, SCR-32 passes nothing and gets every
 * role. `/users` is one of SA §15's unbounded collections (API-X04), so the
 * page is cursor-paginated in the fixed `created_at DESC` order APIS §9.4
 * gives this endpoint, `limit` defaulting to 20 and clamped to `[1,100]`
 * rather than rejected (APIS §9.2).
 */
@Injectable()
export class ListUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(query: ListUsersQueryDto): Promise<ListUsersResponseDto> {
    const limit = clampLimit(query.limit, { default: 20, min: 1, max: 100 });
    const cursor = parseUsersCursor(query.cursor);

    const { rows, hasMore } = await this.userRepository.findPageByRole({
      role: query.role ?? null,
      limit,
      cursor,
    });

    const last = rows[rows.length - 1];
    const next_cursor =
      hasMore && last
        ? encodeCursor<UsersCursor['sortKey']>({
            id: last.id,
            sortKey: { createdAt: last.createdAt },
          })
        : null;

    return {
      data: rows.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.fullName,
        role: u.role,
      })),
      pagination: { next_cursor, has_more: hasMore },
    };
  }
}
