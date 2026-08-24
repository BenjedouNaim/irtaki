export class RejectJoinRequestDataDto {
  status!: 'Rejected';
}

export class RejectJoinRequestResponseDto {
  data!: RejectJoinRequestDataDto;
}
