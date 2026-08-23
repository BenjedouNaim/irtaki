export interface SubmitJoinRequestData {
  id: string;
  status: string;
  score: number;
  created_at: Date;
}

export class SubmitJoinRequestResponseDto {
  data!: SubmitJoinRequestData;
}
