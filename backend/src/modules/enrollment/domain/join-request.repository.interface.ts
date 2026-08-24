import { EntityManager } from 'typeorm';
import { JoinRequest } from './join-request.entity';

export const JOIN_REQUEST_REPOSITORY = Symbol('JOIN_REQUEST_REPOSITORY');

export interface JoinRequestRecord {
  id: string;
  userId: string;
  groupId: string;
  fullName: string;
  gender: string;
  age: number;
  phoneNumber: string;
  occupation: string;
  city: string;
  memorizedHizbCount: number;
  tajweedLevel: string;
  studiedTajweedTheory: boolean;
  studiedQalun: boolean;
  feeAgreement: boolean;
  programGoal: string;
  score: number;
  status: string;
  resolutionSource: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface JoinRequestQueueRow {
  id: string;
  fullName: string;
  score: number;
  createdAt: Date;
}

export interface JoinRequestDetailRow extends JoinRequestRecord {
  memorizedAhzab: number[];
  assistantId: string;
}

export interface JoinRequestAcceptRow {
  userId: string;
  groupId: string;
  fullName: string;
  gender: 'Male' | 'Female';
  memorizedAhzab: number[];
}

export interface JoinRequestRejectRow {
  userId: string;
}

export interface IJoinRequestRepository {
  create(joinRequest: JoinRequest): Promise<JoinRequestRecord>;
  existsPendingForUser(userId: string): Promise<boolean>;
  findLatestForUser(userId: string): Promise<JoinRequestRecord | null>;
  findByIdForDetail(id: string): Promise<JoinRequestDetailRow | null>;
  findPendingQueue(params: {
    assistantId: string | null;
    limit: number;
    cursor: {
      id: string;
      sortKey: { score: number; createdAt: string };
    } | null;
  }): Promise<{ rows: JoinRequestQueueRow[]; hasMore: boolean }>;
  acceptConditionally(
    id: string,
    reviewerId: string,
    manager: EntityManager,
  ): Promise<JoinRequestAcceptRow | null>;
  rejectConditionally(
    id: string,
    reviewerId: string,
    manager?: EntityManager,
  ): Promise<JoinRequestRejectRow | null>;
}

