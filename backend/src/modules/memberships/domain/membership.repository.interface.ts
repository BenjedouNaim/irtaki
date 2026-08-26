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

export interface RosterRow {
  id: string;
  userId: string;
  fullName: string | null;
  gender: string | null;
  startedAt: string;
  state: 'Active' | 'Terminated';
}

export interface IMembershipRepository {
  create(
    props: CreateMembershipRecordProps,
    manager: EntityManager,
  ): Promise<{ id: string; startedAt: string }>;
  findActiveByUserId(userId: string): Promise<OwnActiveMembershipRecord | null>;
  findRosterByGroupId(
    groupId: string,
    options: { asOf?: string },
  ): Promise<RosterRow[]>;
}
