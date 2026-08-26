export interface RosterEntryUserDto {
  id: string;
  full_name: string | null;
  gender: string | null;
}

export interface RosterEntryDto {
  id: string;
  user: RosterEntryUserDto;
  started_at: string;
  state: string;
}

export interface GetRosterResponseDto {
  data: RosterEntryDto[];
}
