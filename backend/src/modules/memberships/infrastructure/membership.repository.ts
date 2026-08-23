import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import {
  CreateMembershipRecordProps,
  IMembershipRepository,
} from '../domain/membership.repository.interface';
import { Membership } from '../domain/membership.entity';
import { MembershipTypeOrmEntity } from './membership.typeorm-entity';

@Injectable()
export class MembershipRepository implements IMembershipRepository {
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
}
