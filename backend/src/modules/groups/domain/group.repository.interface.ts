export const GROUP_REPOSITORY = Symbol('GROUP_REPOSITORY');

export interface GroupStaffSummary {
  id: string;
  full_name: string | null;
}

export interface GroupListRow {
  id: string;
  name: string;
  gender: string;
  recitation_day: number;
  enrollment_status: string;
  lifecycle_state: string;
  created_at: Date;
  teacher: GroupStaffSummary;
  assistant: GroupStaffSummary;
}

/** Outcome of a guarded UC-13 lifecycle flip. */
export interface GroupLifecycleTransition {
  /** False when the guard matched nothing — the group was already in the
   *  target state, which BR-42 makes a no-op rather than an error. */
  changed: boolean;
  group: GroupListRow | null;
}

/**
 * Outcome of DS-07's archival transaction (UC-13 / FR-REQ-08).
 *
 * `changed` is false when the guarded `UPDATE … WHERE lifecycle_state =
 * 'Active'` matched nothing — the group was archived by a concurrent Admin
 * between this caller's read and its write. That is BR-42's documented no-op,
 * not an error, and nothing was cascaded because the guard decided first, so
 * `autoRejectedRequestIds` is empty and the winner owns the DE-10 emission.
 */
export interface GroupArchivalResult extends GroupLifecycleTransition {
  /** JoinRequests auto-rejected by the cascade (FR-REQ-08), for DE-04 fan-out. */
  autoRejectedRequestIds: string[];
}

export interface IGroupRepository {
  findAllForList(): Promise<GroupListRow[]>;
  /**
   * API-009's Admin `group_count` — every group row, archived included, so
   * the tile and the `GET /groups` list the tile taps through to
   * (APIS §10.4, which applies no lifecycle filter either) always agree.
   * ONE parameterised `COUNT(*)`; the list read is never fetched just to be
   * measured.
   */
  countAll(): Promise<number>;
  findByStaffIdForList(staffId: string): Promise<GroupListRow[]>;
  findByActiveMemberForList(userId: string): Promise<GroupListRow | null>;
  findAvailableForGender(gender: 'Male' | 'Female'): Promise<GroupListRow[]>;
  findGenderByUserId(userId: string): Promise<'Male' | 'Female' | null>;
  findByIdForDetail(groupId: string): Promise<GroupListRow | null>;
  findByActiveMemberAndGroupId(
    userId: string,
    groupId: string,
  ): Promise<GroupListRow | null>;
  findByName(name: string): Promise<GroupListRow | null>;
  create(group: {
    id: string;
    name: string;
    gender: 'Male' | 'Female';
    recitationDay: number;
    enrollmentStatus?: string;
    lifecycleState?: string;
    teacherId: string;
    assistantId: string;
    createdBy: string;
  }): Promise<GroupListRow>;
  updateName(id: string, name: string): Promise<GroupListRow | null>;
  /**
   * Conditional toggle (BR-42): flips `enrollment_status` only while the group
   * still holds `lifecycle_state = 'Active'`. Returns null when the guard did
   * not match, which the use case maps to the documented no-op — this is what
   * keeps a concurrent archival from being overwritten without any row
   * locking (TS §20).
   */
  updateEnrollmentStatus(
    id: string,
    status: 'Open' | 'Closed',
  ): Promise<GroupListRow | null>;
  updateStaff(
    id: string,
    fields: { teacherId?: string; assistantId?: string },
  ): Promise<GroupListRow | null>;
  /**
   * The un-archive half of UC-13. Guarded on `lifecycle_state = 'Archived'`
   * so it can never clobber a concurrent archive whose FR-REQ-08 cascade has
   * already rejected the group's Pending queue.
   */
  unarchive(groupId: string): Promise<GroupLifecycleTransition>;
  /**
   * DS-07 GroupArchivalService (UC-13). Flips the group to `Archived` **and**
   * auto-rejects every `Pending` JoinRequest targeting it (FR-REQ-08, BR-42)
   * inside ONE transaction (AR-04, DBD §27) — the cascade is not an async
   * listener, because an async cascade is exactly the TOCTOU window an
   * Assistant's concurrent accept slips through.
   *
   * APIS §13.1 assigns both `groups` and the bulk `join_requests` reject to
   * this module for UC-13; the write follows the same parameterised-raw-SQL
   * shape `deleteById`'s cascade already uses, so no Enrollment repository is
   * injected and no new module edge is created (SA §11).
   */
  archiveWithPendingRejection(
    groupId: string,
    archivedAt: Date,
  ): Promise<GroupArchivalResult>;
  hasMembershipHistory(groupId: string): Promise<boolean>;
  hasActiveMembership(userId: string): Promise<boolean>;
  deleteById(groupId: string): Promise<boolean>;
}
