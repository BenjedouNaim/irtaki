import { EntityManager } from 'typeorm';

export const MEMBERSHIP_REPOSITORY = Symbol('MEMBERSHIP_REPOSITORY');

export interface CreateMembershipRecordProps {
  id?: string;
  userId: string;
  groupId: string;
  joinRequestId: string;
  startedAt?: string;
}

export interface OwnActiveMembershipRecord {
  id: string;
  group: {
    id: string;
    name: string;
    recitationDay: number;
    enrollmentStatus: string;
  };
  startedAt: string;
  state: 'Active';
}

export interface IMembershipRepository {
  create(
    props: CreateMembershipRecordProps,
    manager: EntityManager,
  ): Promise<{ id: string; startedAt: string }>;
  findActiveByUserId(userId: string): Promise<OwnActiveMembershipRecord | null>;
}
