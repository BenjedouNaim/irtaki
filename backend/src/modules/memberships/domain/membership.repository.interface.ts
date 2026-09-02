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

export interface MembershipRecoveryMembershipRecord {
  id: string;
  user: {
    id: string;
    fullName: string | null;
    gender: string | null;
  };
  group: {
    id: string;
    name: string;
    recitationDay: number;
    enrollmentStatus: string;
  };
  state: 'Active' | 'Terminated';
  startedAt: string;
  endedAt: string | null;
  endedBy: string | null;
}

export interface DailyReportRecoveryRecord {
  id: string;
  membershipId: string;
  reportDate: string;
  type: string;
  submittedAt: string;
  submittedTimezone: string;
  noMemorizationToday: boolean | null;
  memoFromOrdinal: number | null;
  memoToOrdinal: number | null;
  memoTimeFrom: string | null;
  memoTimeTo: string | null;
  completed50Repetitions: boolean | null;
  repetitionsInSingleSession: boolean | null;
  noRevisionToday: boolean | null;
  revFromOrdinal: number | null;
  revToOrdinal: number | null;
  revTimeFrom: string | null;
  revTimeTo: string | null;
  readTafsir: boolean | null;
  absenceReason: string | null;
  deletedAt: string;
}

export interface WeeklyReportRecoveryRecord {
  id: string;
  membershipId: string;
  weekStart: string;
  weekEnd: string;
  expectedDays: number;
  missedDailyReports: number;
  missedDailyMemorization: number;
  missedDailyRevision: number;
  missed50Repetitions: number;
  missedSingleSession: number;
  attendedRecitationCall: boolean;
  state: string;
  finalisedAt: string | null;
  finalisedBy: string | null;
  deletedAt: string;
}

export interface PaymentRecordRecoveryRecord {
  id: string;
  membershipId: string;
  cycleIndex: number;
  amount: string;
  paidAt: string;
  recordedBy: string;
  deletedAt: string;
}

export interface MembershipRecoveryData {
  membership: MembershipRecoveryMembershipRecord;
  dailyReports: DailyReportRecoveryRecord[];
  weeklyReports: WeeklyReportRecoveryRecord[];
  paymentRecords: PaymentRecordRecoveryRecord[];
}

export interface MembershipScopeRecord {
  id: string;
  groupId: string;
  userId: string;
  state: 'Active' | 'Terminated';
}

export interface IMembershipRepository {
  /** Minimal lookup for instance-level scope checks (NFR-19/20). */
  findScopeById(membershipId: string): Promise<MembershipScopeRecord | null>;
  create(
    props: CreateMembershipRecordProps,
    manager: EntityManager,
  ): Promise<{ id: string; startedAt: string }>;
  findActiveByUserId(userId: string): Promise<OwnActiveMembershipRecord | null>;
  findRosterByGroupId(
    groupId: string,
    options: { asOf?: string },
  ): Promise<RosterRow[]>;
  findByIdForRecovery(id: string): Promise<MembershipRecoveryData | null>;
  findStateAndUserById(
    membershipId: string,
    manager: EntityManager,
  ): Promise<{ userId: string; state: string } | null>;
  terminateConditionally(
    membershipId: string,
    endedBy: string,
    endedAt: string,
    manager: EntityManager,
  ): Promise<{ userId: string; joinRequestId: string | null } | null>;
  softDeleteMembershipRecords(
    membershipId: string,
    joinRequestId: string | null,
    manager: EntityManager,
  ): Promise<void>;
}
