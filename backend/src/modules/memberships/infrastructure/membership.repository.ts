import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  CreateMembershipRecordProps,
  IMembershipRepository,
  OwnActiveMembershipRecord,
} from '../domain/membership.repository.interface';
import { Membership } from '../domain/membership.entity';
import { MembershipTypeOrmEntity } from './membership.typeorm-entity';
import { GroupTypeOrmEntity } from '../../groups/infrastructure/group.typeorm-entity';

interface RawOwnActiveMembershipRow {
  membership_id: string;
  group_id: string;
  group_name: string;
  recitation_day: number | string;
  enrollment_status: string;
  started_at: string;
  state: 'Active';
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
}
