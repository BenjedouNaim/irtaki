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
  updateLifecycle(
    id: string,
    lifecycleState: 'Active' | 'Archived',
    archivedAt: Date | null,
  ): Promise<GroupListRow | null>;
  hasMembershipHistory(groupId: string): Promise<boolean>;
  hasActiveMembership(userId: string): Promise<boolean>;
  deleteById(groupId: string): Promise<boolean>;
}
