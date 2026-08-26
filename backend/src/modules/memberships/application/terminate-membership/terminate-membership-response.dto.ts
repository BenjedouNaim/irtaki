export class TerminateMembershipDataDto {
  membership_id!: string;
  state!: 'Terminated';
}

export class TerminateMembershipResponseDto {
  data!: TerminateMembershipDataDto;
}
