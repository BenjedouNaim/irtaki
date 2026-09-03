import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IGroupPaymentScope } from '../domain/group-payment-scope.interface';

/**
 * TS §15.2's worked example, shaped for API-046's group path id:
 *
 *   SELECT 1 FROM groups WHERE id = :groupId AND assistant_id = :A
 *
 * One literal, parameterised statement (TS §36) on the groups primary key.
 * No cache, no cross-module call (SA §14 / DEC-C11).
 */
@Injectable()
export class GroupPaymentScope implements IGroupPaymentScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isGroupOfAssistant(
    groupId: string,
    assistantId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM groups g
        WHERE g.id = $1
          AND g.assistant_id = $2
        LIMIT 1`,
      [groupId, assistantId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async groupExists(groupId: string): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM groups g
        WHERE g.id = $1
        LIMIT 1`,
      [groupId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
