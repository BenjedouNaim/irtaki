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

export interface IJoinRequestRepository {
  create(joinRequest: JoinRequest): Promise<JoinRequestRecord>;
  existsPendingForUser(userId: string): Promise<boolean>;
  findLatestForUser(userId: string): Promise<JoinRequestRecord | null>;
}
