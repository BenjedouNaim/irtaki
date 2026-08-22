export interface GroupStaffDto {
  id: string;
  full_name: string | null;
}

export interface GroupListItemDto {
  id: string;
  name: string;
  gender: string;
  recitation_day: number;
  enrollment_status: string;
  lifecycle_state: string;
  teacher: GroupStaffDto;
  assistant: GroupStaffDto;
}

export interface GroupListItemLimitedDto {
  id: string;
  name: string;
  recitation_day: number;
  enrollment_status: string;
}

export type GroupListItem = GroupListItemDto | GroupListItemLimitedDto;

export interface ListGroupsResponseDto {
  data: GroupListItem[];
}
