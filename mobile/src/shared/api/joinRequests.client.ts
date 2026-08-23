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

export interface JoinRequestQueueItem {
  id: string;
  full_name: string;
  score: number;
  created_at: string;
}

export interface ListPendingJoinRequestsResponse {
  data: JoinRequestQueueItem[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

export async function listPendingJoinRequests(params?: {
  cursor?: string;
  limit?: number;
}): Promise<ListPendingJoinRequestsResponse> {
  return apiClient.get<ListPendingJoinRequestsResponse>('/join-requests', {
    params: {
      status: 'pending',
      ...(params?.cursor ? { cursor: params.cursor } : {}),
      ...(params?.limit !== undefined ? { limit: params.limit } : {}),
    },
  });
}

export interface ApplicantProfile {
  id: string;
  full_name: string;
  gender: 'Male' | 'Female' | string;
  age: number;
  phone_number: string;
  occupation: string;
  city: string;
  memorized_ahzab: number[];
  tajweed_level: 'Beginner' | 'Intermediate' | 'Advanced' | string;
  studied_tajweed_theory: boolean;
  studied_qalun: boolean;
  fee_agreement: boolean;
  program_goal: string;
  score: number;
  status: 'Pending' | 'Accepted' | 'Rejected' | string;
  created_at: string;
}

export interface GetJoinRequestDetailResponse {
  data: ApplicantProfile;
}

export async function getJoinRequestDetail(
  id: string,
): Promise<GetJoinRequestDetailResponse> {
  return apiClient.get<GetJoinRequestDetailResponse>(`/join-requests/${id}`);
}
