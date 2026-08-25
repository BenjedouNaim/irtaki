export interface OwnMembershipGroupDto {
  id: string;
  name: string;
  recitation_day: number;
  enrollment_status: string;
}

export interface OwnMembershipDataDto {
  id: string;
  group: OwnMembershipGroupDto;
  started_at: string;
  state: 'Active';
}

export interface OwnMembershipResponseDto {
  data: OwnMembershipDataDto;
}
