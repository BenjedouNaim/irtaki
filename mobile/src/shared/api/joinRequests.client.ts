import { apiClient } from './client';

export interface SubmitJoinRequestPayload {
  group_id: string;
  full_name: string;
  gender: 'Male' | 'Female';
  phone_number: string;
  occupation: string;
  city: string;
  age: number;
  memorized_ahzab: number[];
  tajweed_level: 'Beginner' | 'Intermediate' | 'Advanced';
  studied_tajweed_theory: boolean;
  studied_qalun: boolean;
  fee_agreement: boolean;
  program_goal: string;
}

export interface SubmitJoinRequestResponse {
  data: {
    id: string;
    status: string;
    score: number;
    created_at: string;
  };
}

export async function submitJoinRequest(
  payload: SubmitJoinRequestPayload,
): Promise<SubmitJoinRequestResponse> {
  return apiClient.post<SubmitJoinRequestResponse>('/join-requests', payload);
}

export interface GetMyJoinRequestResponse {
  data: {
    status: 'Pending' | 'Accepted' | 'Rejected';
  };
}

export async function getMyJoinRequest(): Promise<GetMyJoinRequestResponse> {
  return apiClient.get<GetMyJoinRequestResponse>('/join-requests/mine');
}
