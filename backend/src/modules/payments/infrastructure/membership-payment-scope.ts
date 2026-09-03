import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IMembershipPaymentScope } from '../domain/membership-payment-scope.interface';

/**
 * TS §15.2's worked example, shaped for API-047's membership path id:
 *
 *   SELECT 1 FROM memberships m JOIN groups g ON g.id = m.group_id
 *    WHERE m.id = :id AND g.assistant_id = :A AND m.state = 'Active'
 *
 * One literal, parameterised statement (TS §36) over the memberships
 * primary key. No cache, no cross-module call (SA §14 / DEC-C11), and the
 * same shape the Reports module uses for its Teacher-scoped membership
 * routes — only the staff column differs, because the Assistant is the
 * actor here (BR-34) and the Teacher never is (SRS §10).
 */
@Injectable()
export class MembershipPaymentScope implements IMembershipPaymentScope {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async isActiveMembershipOfAssistant(
    membershipId: string,
    assistantId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<Array<{ ok: number }>>(
      `SELECT 1 AS ok
         FROM memberships m
         JOIN groups g ON g.id = m.group_id
        WHERE m.id = $1
          AND g.assistant_id = $2
          AND m.state = 'Active'
        LIMIT 1`,
      [membershipId, assistantId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }
}
