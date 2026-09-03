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
  /**
   * The applicant's `users.timezone`, read in the same statement that flips
   * the request to `Accepted`. DS-01 dates the new Membership's `started_at`
   * with it: INV-27 / T-01 make the User's own timezone the single
   * authority for every day-boundary evaluation involving that User, and
   * `started_at` is a calendar date (DBD `DATE`).
   */
  timezone: string;
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
  /**
   * API-009's `pending_request_count` — how many live `Pending` requests sit
   * in the caller's review queue, over the SAME scope predicate
   * `findPendingQueue` applies (`assistantId = null` = the Admin's whole
   * queue). One parameterised `COUNT(*)` over DB-IDX-05, never the length of
   * a fetched page: the queue is cursor-paginated and APIS §9.1 puts no
   * total on it, so the dashboard tile cannot be derived from a page.
   */
  countPendingForAssistant(assistantId: string | null): Promise<number>;
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
