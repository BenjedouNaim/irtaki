import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateMembershipRecordProps,
  IMembershipRepository,
  OwnActiveMembershipRecord,
  RosterRow,
} from '../domain/membership.repository.interface';
import { Membership } from '../domain/membership.entity';
import { MembershipTypeOrmEntity } from './membership.typeorm-entity';
import { GroupTypeOrmEntity } from '../../groups/infrastructure/group.typeorm-entity';
import { UserTypeOrmEntity } from '../../identity/infrastructure/user.typeorm-entity';

interface RawOwnActiveMembershipRow {
  membership_id: string;
  group_id: string;
  group_name: string;
  recitation_day: number | string;
  enrollment_status: string;
  started_at: string;
  state: 'Active';
}

interface RawRosterRow {
  membership_id: string;
  user_id: string;
  full_name: string | null;
  gender: string | null;
  started_at: string;
  state: 'Active' | 'Terminated';
}

@Injectable()
export class MembershipRepository implements IMembershipRepository {
  constructor(
    @InjectRepository(MembershipTypeOrmEntity)
    private readonly membershipRepo: Repository<MembershipTypeOrmEntity>,
  ) {}

  async create(
    props: CreateMembershipRecordProps,
    manager: EntityManager,
  ): Promise<{ id: string; startedAt: string }> {
    const domain = Membership.createFromAcceptance(props);

    const entity = manager.create(MembershipTypeOrmEntity, {
      id: domain.id,
      userId: domain.userId,
      groupId: domain.groupId,
      joinRequestId: domain.joinRequestId,
      state: domain.state,
      startedAt: domain.startedAt,
      endedAt: domain.endedAt,
      endedBy: domain.endedBy,
      createdAt: domain.createdAt,
      updatedAt: domain.updatedAt,
    });

    await manager.save(MembershipTypeOrmEntity, entity);

    return {
      id: domain.id,
      startedAt: domain.startedAt,
    };
  }

  async findActiveByUserId(
    userId: string,
  ): Promise<OwnActiveMembershipRecord | null> {
    const row = await this.membershipRepo
      .createQueryBuilder('m')
      .innerJoin(GroupTypeOrmEntity, 'g', 'g.id = m.group_id')
      .where('m.user_id = :userId', { userId })
      .andWhere('m.state = :state', { state: 'Active' })
      .select([
        'm.id AS membership_id',
        'g.id AS group_id',
        'g.name AS group_name',
        'g.recitation_day AS recitation_day',
        'g.enrollment_status AS enrollment_status',
        'm.started_at::text AS started_at',
        'm.state AS state',
      ])
      .getRawOne<RawOwnActiveMembershipRow>();

    if (!row) {
      return null;
    }

    return {
      id: row.membership_id,
      group: {
        id: row.group_id,
        name: row.group_name,
        recitationDay: Number(row.recitation_day),
        enrollmentStatus: row.enrollment_status,
      },
      startedAt: row.started_at,
      state: 'Active',
    };
  }

  async findRosterByGroupId(
    groupId: string,
    options: { asOf?: string },
  ): Promise<RosterRow[]> {
    const qb = this.membershipRepo
      .createQueryBuilder('m')
      .leftJoin(UserTypeOrmEntity, 'u', 'u.id = m.user_id')
      .where('m.group_id = :groupId', { groupId });

    if (options.asOf) {
      qb.andWhere('m.started_at <= :asOf', { asOf: options.asOf }).andWhere(
        '(m.ended_at IS NULL OR m.ended_at >= :asOf)',
        { asOf: options.asOf },
      );
    } else {
      qb.andWhere('m.state = :state', { state: 'Active' });
    }

    const rows = await qb
      .select([
        'm.id AS membership_id',
        'm.user_id AS user_id',
        'u.full_name AS full_name',
        'u.gender AS gender',
        'm.started_at::text AS started_at',
        'm.state AS state',
      ])
      .orderBy('u.full_name', 'ASC')
      .getRawMany<RawRosterRow>();

    return rows.map((row) => ({
      id: row.membership_id,
      userId: row.user_id,
      fullName: row.full_name ?? null,
      gender: row.gender ?? null,
      startedAt: row.started_at,
      state: row.state,
    }));
  }

  async findStateAndUserById(
    membershipId: string,
    manager: EntityManager,
  ): Promise<{ userId: string; state: string } | null> {
    const queryResult: unknown = await manager.query(
      `SELECT user_id AS "userId", state FROM memberships WHERE id = $1 LIMIT 1`,
      [membershipId],
    );

    const rows = (
      Array.isArray(queryResult) && Array.isArray(queryResult[0])
        ? queryResult[0]
        : Array.isArray(queryResult)
          ? queryResult
          : []
    ) as Array<{ userId: string; state: string }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    return { userId: rows[0].userId, state: rows[0].state };
  }

  async terminateConditionally(
    membershipId: string,
    endedBy: string,
    endedAt: string,
    manager: EntityManager,
  ): Promise<{ userId: string; joinRequestId: string | null } | null> {
    const updateResult: unknown = await manager.query(
      `UPDATE memberships
       SET state = 'Terminated',
           ended_at = $3::date,
           ended_by = $2,
           updated_at = now()
       WHERE id = $1 AND state = 'Active'
       RETURNING user_id AS "userId", join_request_id AS "joinRequestId"`,
      [membershipId, endedBy, endedAt],
    );

    const rows = (
      Array.isArray(updateResult) && Array.isArray(updateResult[0])
        ? updateResult[0]
        : Array.isArray(updateResult)
          ? updateResult
          : []
    ) as Array<{ userId: string; joinRequestId: string | null }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    return {
      userId: rows[0].userId,
      joinRequestId: rows[0].joinRequestId ?? null,
    };
  }

  async softDeleteMembershipRecords(
    membershipId: string,
    joinRequestId: string | null,
    manager: EntityManager,
  ): Promise<void> {
    // AR-04 cohesion: termination and its cascade must land in one transaction so a crash can never leave live records pointing at a Terminated membership.
    await manager.query(
      `UPDATE daily_reports SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    await manager.query(
      `UPDATE weekly_reports SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    await manager.query(
      `UPDATE payment_records SET deleted_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
    if (joinRequestId) {
      await manager.query(
        `UPDATE join_requests SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
        [joinRequestId],
      );
    }
    await manager.query(
      `UPDATE memorization_coverage SET deleted_at = now(), updated_at = now() WHERE membership_id = $1 AND deleted_at IS NULL`,
      [membershipId],
    );
  }
}
