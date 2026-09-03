import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IGroupPerformanceScope } from '../domain/group-performance-scope.interface';

/**
 * SA §14's own resolution query, narrowed to the one staff column this
 * route grants: `SELECT 1 FROM groups WHERE id = :id AND teacher_id = :T`.
 *
 * `assistant_id` is deliberately NOT part of the predicate — DEC-B09 keeps
 * the Assistant off every performance route unconditionally, so an
 * Assistant who happens to staff the group must still be denied. In
 * practice RolesGuard rejects them first (they are absent from `@Roles()`);
 * this query is the second half of that guarantee (NFR-19 defence in depth).
 *
 * One literal, parameterised statement (TS §36) on the `groups` primary
 * key. No cache (DEC-C11), no cross-module call (SA §14).
 */
@Injectable()
export class GroupPerformanceScope implements IGroupPerformanceScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isGroupOfTeacher(groupId: string, teacherId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM groups g
        WHERE g.id = $1
          AND g.teacher_id = $2
        LIMIT 1`,
      [groupId, teacherId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
