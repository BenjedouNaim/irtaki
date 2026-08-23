export interface ApplicantProfileDto {
  id: string;
  full_name: string;
  gender: string;
  age: number;
  phone_number: string;
  occupation: string;
  city: string;
  memorized_ahzab: number[];
  tajweed_level: string;
  studied_tajweed_theory: boolean;
  studied_qalun: boolean;
  fee_agreement: boolean;
  program_goal: string;
  score: number;
  status: string;
  created_at: string;
}

export class GetJoinRequestDetailResponseDto {
  data!: ApplicantProfileDto;
}
