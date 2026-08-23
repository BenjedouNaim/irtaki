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
  updateEnrollmentStatus(
    id: string,
    status: 'Open' | 'Closed',
  ): Promise<GroupListRow | null>;
  updateStaff(
    id: string,
    fields: { teacherId?: string; assistantId?: string },
  ): Promise<GroupListRow | null>;
}
