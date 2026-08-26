import { apiClient } from './client';

export type MembershipState = 'Active' | 'Terminated';

export interface RosterEntryUser {
  id: string;
  full_name: string | null;
  gender: string | null;
}

export interface RosterEntry {
  id: string;
  user: RosterEntryUser;
  started_at: string;
  state: MembershipState;
}

export interface GetGroupMembershipsResponse {
  data: RosterEntry[];
}

export async function getGroupMemberships(
  groupId: string,
  queryParams?: { as_of?: string },
): Promise<GetGroupMembershipsResponse> {
  const endpoint = `/groups/${groupId}/memberships`;
  if (queryParams && queryParams.as_of !== undefined) {
    return apiClient.get<GetGroupMembershipsResponse>(endpoint, {
      params: { as_of: queryParams.as_of },
    });
  }
  return apiClient.get<GetGroupMembershipsResponse>(endpoint);
}
