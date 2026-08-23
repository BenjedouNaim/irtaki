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

export interface UpdateGroupNamePayload {
  name: string;
}

export async function updateGroupName(
  id: string,
  payload: UpdateGroupNamePayload,
): Promise<GroupDetailResponse> {
  return apiClient.patch<GroupDetailResponse>(`/groups/${id}`, payload);
}

export interface ToggleEnrollmentPayload {
  enrollment_status: 'Open' | 'Closed';
}

export async function toggleEnrollment(
  id: string,
  payload: ToggleEnrollmentPayload,
): Promise<GroupDetailResponse> {
  return apiClient.patch<GroupDetailResponse>(
    `/groups/${id}/enrollment`,
    payload,
  );
}

export interface ReassignStaffPayload {
  teacher_id?: string;
  assistant_id?: string;
}

export async function reassignStaff(
  id: string,
  payload: ReassignStaffPayload,
): Promise<GroupDetailResponse> {
  return apiClient.patch<GroupDetailResponse>(`/groups/${id}/staff`, payload);
}

export interface SetLifecyclePayload {
  lifecycle_state: 'Active' | 'Archived';
}

export async function setGroupLifecycle(
  id: string,
  lifecycleState: 'Active' | 'Archived',
): Promise<GroupDetailResponse> {
  return apiClient.patch<GroupDetailResponse>(`/groups/${id}/lifecycle`, {
    lifecycle_state: lifecycleState,
  });
}

export async function deleteGroup(id: string): Promise<void> {
  return apiClient.delete<void>(`/groups/${id}`);
}
