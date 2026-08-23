export type JoinRequestStatus = 'Pending' | 'Accepted' | 'Rejected';

export interface JoinRequestStatusData {
  status: JoinRequestStatus;
}

export class JoinRequestStatusDto {
  data!: JoinRequestStatusData;
}
