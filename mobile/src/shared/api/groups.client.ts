import { apiClient } from './client';

export interface GroupStaff {
  id: string;
  full_name: string | null;
}

export interface GroupListItemFull {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  recitation_day: number;
  enrollment_status: 'Open' | 'Closed';
  lifecycle_state: 'Active' | 'Archived';
  teacher: GroupStaff;
  assistant: GroupStaff;
}

export interface GroupListItemLimited {
  id: string;
  name: string;
  recitation_day: number;
  enrollment_status: 'Open' | 'Closed';
}

export type GroupListItem = GroupListItemFull | GroupListItemLimited;

export interface ListGroupsResponse {
  data: GroupListItem[];
}

export async function listGroups(): Promise<ListGroupsResponse> {
  return apiClient.get<ListGroupsResponse>('/groups');
}

export async function listAvailableGroups(
  gender: 'Male' | 'Female',
): Promise<ListGroupsResponse> {
  return apiClient.get<ListGroupsResponse>('/groups/available', {
    params: { gender },
  });
}

export interface GroupDetailResponse {
  data: GroupListItem;
}

export async function getGroupDetail(id: string): Promise<GroupDetailResponse> {
  return apiClient.get<GroupDetailResponse>(`/groups/${id}`);
}

export interface CreateGroupPayload {
  name: string;
  gender: 'Male' | 'Female';
  recitation_day: number;
  teacher_id: string;
  assistant_id: string;
}

export async function createGroup(
  payload: CreateGroupPayload,
): Promise<GroupDetailResponse> {
  return apiClient.post<GroupDetailResponse>('/groups', payload);
}
